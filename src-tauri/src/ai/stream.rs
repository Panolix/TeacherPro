use std::sync::Arc;
use std::time::Duration;
use tokio::sync::watch;

pub struct Cancellation(watch::Sender<bool>);

impl Cancellation {
    pub fn new() -> Self {
        Self(watch::channel(false).0)
    }

    pub fn cancel(&self) {
        self.0.send_replace(true);
    }

    pub fn is_cancelled(&self) -> bool {
        *self.0.borrow()
    }

    pub async fn cancelled(&self) {
        let mut receiver = self.0.subscribe();
        while !*receiver.borrow_and_update() {
            if receiver.changed().await.is_err() { break; }
        }
    }
}

/// Dropping a pending HTTP future/response on cancel closes the generation
/// connection, unlike an atomic flag checked around a blocking read.
pub struct StreamReader {
    response: reqwest::Response,
    buffer: Vec<u8>,
    cancel: Arc<Cancellation>,
    eof: bool,
}

impl StreamReader {
    pub async fn connect(port: u16, key: &str, body: String, cancel: Arc<Cancellation>) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(120))
            .build().map_err(|e| e.to_string())?;
        let request = client.post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
            .bearer_auth(key).header("Content-Type", "application/json").body(body).send();
        let response = tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err("cancelled".into()),
            response = request => response.map_err(|e| format!("Engine request failed: {e}"))?,
        }.error_for_status().map_err(|e| format!("Engine request failed: {e}"))?;
        Ok(Self { response, buffer: Vec::new(), cancel, eof: false })
    }

    pub async fn next_line(&mut self) -> Result<Option<String>, String> {
        loop {
            if self.cancel.is_cancelled() { return Err("cancelled".into()); }
            if let Some(end) = self.buffer.iter().position(|byte| *byte == b'\n') {
                let bytes: Vec<u8> = self.buffer.drain(..=end).collect();
                return String::from_utf8(bytes).map(Some).map_err(|e| format!("Invalid AI stream UTF-8: {e}"));
            }
            if self.eof {
                if self.buffer.is_empty() { return Ok(None); }
                return String::from_utf8(std::mem::take(&mut self.buffer)).map(Some)
                    .map_err(|e| format!("Invalid AI stream UTF-8: {e}"));
            }
            let chunk = tokio::select! {
                biased;
                _ = self.cancel.cancelled() => return Err("cancelled".into()),
                chunk = self.response.chunk() => chunk.map_err(|e| format!("AI stream read failed: {e}"))?,
            };
            match chunk {
                Some(chunk) => {
                    self.buffer.extend_from_slice(&chunk);
                    if self.buffer.len() > 1024 * 1024 { return Err("AI stream line exceeds the size limit.".into()); }
                }
                None => self.eof = true,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn stalled_server(send_headers: bool) -> (u16, std::sync::mpsc::Receiver<()>, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (ready, receiver) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let mut bytes = [0; 4096];
            assert!(stream.read(&mut bytes).unwrap() > 0);
            if send_headers {
                stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n").unwrap();
            }
            ready.send(()).unwrap();
            // The cancelled reader must release the connection rather than
            // waiting for the normal 120-second stream timeout.
            loop { match stream.read(&mut bytes) { Ok(0) => break, Ok(_) => {}, Err(_) => break } }
        });
        (port, receiver, thread)
    }

    fn response_server(status: &str, body: Vec<u8>) -> (u16, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let status = status.to_string();
        let thread = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let mut request = [0; 4096];
            assert!(socket.read(&mut request).unwrap() > 0);
            write!(socket, "HTTP/1.1 {status}\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n").unwrap();
            // Split UTF-8 characters and SSE lines across HTTP body chunks.
            for byte in body {
                socket.write_all(&[b'1', b'\r', b'\n', byte, b'\r', b'\n']).unwrap();
            }
            socket.write_all(b"0\r\n\r\n").unwrap();
        });
        (port, thread)
    }

    #[tokio::test]
    async fn reads_fragmented_utf8_crlf_and_final_unterminated_lines() {
        let (port, server) = response_server("200 OK", "data: Grüße\r\ndata: [DONE]\nlast line".as_bytes().to_vec());
        let mut reader = StreamReader::connect(port, "fixture", "{}".into(), Arc::new(Cancellation::new())).await.unwrap();
        assert_eq!(reader.next_line().await.unwrap().as_deref(), Some("data: Grüße\r\n"));
        assert_eq!(reader.next_line().await.unwrap().as_deref(), Some("data: [DONE]\n"));
        assert_eq!(reader.next_line().await.unwrap().as_deref(), Some("last line"));
        assert!(reader.next_line().await.unwrap().is_none());
        server.join().unwrap();
    }

    #[tokio::test]
    async fn reports_invalid_utf8_instead_of_silently_corrupting_output() {
        let (port, server) = response_server("200 OK", vec![0xff, b'\n']);
        let mut reader = StreamReader::connect(port, "fixture", "{}".into(), Arc::new(Cancellation::new())).await.unwrap();
        assert!(reader.next_line().await.unwrap_err().contains("UTF-8"));
        server.join().unwrap();
    }

    #[tokio::test]
    async fn reports_http_failures() {
        let (port, server) = response_server("503 Service Unavailable", Vec::new());
        let result = StreamReader::connect(port, "fixture", "{}".into(), Arc::new(Cancellation::new())).await;
        assert!(matches!(result, Err(ref error) if error.contains("503")));
        server.join().unwrap();
    }

    #[tokio::test]
    async fn cancels_while_waiting_for_response_headers() {
        let (port, ready, server) = stalled_server(false);
        let cancel = Arc::new(Cancellation::new());
        let token = cancel.clone();
        let request = tokio::spawn(async move { StreamReader::connect(port, "fixture", "{}".into(), token).await });
        tokio::task::spawn_blocking(move || ready.recv_timeout(Duration::from_secs(3)).unwrap()).await.unwrap();
        cancel.cancel();
        let result = tokio::time::timeout(Duration::from_secs(1), request).await.unwrap().unwrap();
        assert!(matches!(result, Err(ref error) if error == "cancelled"));
        server.join().unwrap();
    }

    #[tokio::test]
    async fn cancels_a_stalled_body_read() {
        let (port, _ready, server) = stalled_server(true);
        let cancel = Arc::new(Cancellation::new());
        let mut reader = StreamReader::connect(port, "fixture", "{}".into(), cancel.clone()).await.unwrap();
        let reading = tokio::spawn(async move { reader.next_line().await });
        cancel.cancel();
        let result = tokio::time::timeout(Duration::from_secs(1), reading).await.unwrap().unwrap();
        assert_eq!(result.unwrap_err(), "cancelled");
        server.join().unwrap();
    }

    #[tokio::test]
    async fn cancellation_is_remembered_before_a_request_begins() {
        let cancel = Arc::new(Cancellation::new());
        cancel.cancel();
        let result = StreamReader::connect(1, "fixture", "{}".into(), cancel).await;
        assert!(matches!(result, Err(ref error) if error == "cancelled"));
    }
}

# Third-Party Components & Licenses

TeacherPro itself is licensed under CC BY-NC 4.0 (see `LICENSE`). The following
third-party components are used at runtime or are downloaded on demand.

## Models

### IBM Granite Embedding 311M Multilingual R2 (embedding model)
- Copyright © IBM
- License: Apache License 2.0 — <https://www.apache.org/licenses/LICENSE-2.0>
- Model page: <https://huggingface.co/ibm-granite/granite-embedding-311m-multilingual-r2>
- Note: the model's tokenizer is derived from the Gemma 3 tokenizer and is
  subject to the [Gemma Terms of Use](https://ai.google.dev/gemma/terms).
- Distribution: downloaded at runtime (`onnx/model_quint8_avx2.onnx` +
  tokenizer files) into the app data directory; not bundled in this repository.

### Chat / draft model GGUFs
Chat models are downloaded on demand from their official/community Hugging Face
repositories and remain under their respective licenses (e.g. Apache 2.0 for
Qwen, Gemma Terms for Gemma, Mistral Research/Commercial terms for Ministral).
The in-app model catalog lists each model with its source.

## Engines & Libraries

### llama.cpp / llama-server
- License: MIT — <https://github.com/ggml-org/llama.cpp/blob/master/LICENSE>
- Distribution: pinned prebuilt binaries are fetched by CI
  (`npm run fetch:engines`) and bundled as app resources; no separate install.

### Rust / JavaScript dependencies
All Rust crates and npm packages are pinned in `src-tauri/Cargo.lock` and
`package-lock.json`. Their licenses are listed in their respective package
metadata.

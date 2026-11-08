-- Match only the current spool file, never a previous TeacherPro print.
on isTargetDocumentName(candidateName, spoolName)
    return candidateName is spoolName
end isTargetDocumentName

on run argv
    if (count of argv) is not 1 then error "Expected a print spool filename."
    if item 1 of argv is "--self-test" then
        if my isTargetDocumentName("teacherpro-print-old.pdf", "teacherpro-print-new.pdf") then error "Selected an old spool document."
        if not my isTargetDocumentName("teacherpro-print-new.pdf", "teacherpro-print-new.pdf") then error "Did not select the current spool document."
        return "Print targeting self-test passed."
    end if

    set spoolName to item 1 of argv
    tell application "Preview"
        activate
        set targetDoc to missing value
        repeat 40 times
            repeat with d in (every document)
                if my isTargetDocumentName((name of d), spoolName) then
                    set targetDoc to d
                    exit repeat
                end if
            end repeat
            if targetDoc is not missing value then exit repeat
            delay 0.25
        end repeat
        if targetDoc is not missing value then
            print targetDoc with print dialog
        end if
    end tell
end run

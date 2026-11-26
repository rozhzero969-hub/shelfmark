import AppKit

if let file = Bundle.main.url(forResource: "Shelfmark", withExtension: "html"),
   NSWorkspace.shared.open(file) {
    exit(EXIT_SUCCESS)
}

let alert = NSAlert()
alert.messageText = "Shelfmark could not open"
alert.informativeText = "Open the standalone Shelfmark.html file in your browser."
alert.runModal()
exit(EXIT_FAILURE)

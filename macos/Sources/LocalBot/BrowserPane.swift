import AppKit
import SwiftUI
import WebKit

@MainActor final class BrowserSession: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
  let web: WKWebView
  @Published var address = ""
  @Published var error: String?
  @Published var loading = false
  @Published var canBack = false
  @Published var canForward = false
  private var observations: [NSKeyValueObservation] = []
  override init() {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    web = WKWebView(frame: .zero, configuration: config)
    super.init()
    web.navigationDelegate = self; web.uiDelegate = self
    web.allowsBackForwardNavigationGestures = true
    observations = [web.observe(\.isLoading, options: [.new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.sync() }
    }, web.observe(\.url, options: [.new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.sync() }
    }]
  }
  func sync() {
    loading = web.isLoading; canBack = web.canGoBack; canForward = web.canGoForward
    if let url = web.url { address = url.absoluteString }
  }
  func submit() {
    let input = address.trimmingCharacters(in: .whitespacesAndNewlines)
    let target = input.contains("://") ? input : input.hasPrefix("/") ? "file://" + input : input.contains(" ") ? "https://www.google.com/search?q=" + (input.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "") : "https://" + input
    guard let url = URL(string: target) else { error = "Invalid address"; return }
    navigate(url)
  }
  func navigate(_ url: URL) {
    guard ["https", "http", "file"].contains(url.scheme?.lowercased() ?? "") else { error = "Unsupported link type"; return }
    error = nil; address = url.absoluteString
    if url.isFileURL { web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()) }
    else { web.load(URLRequest(url: url)) }
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { sync() }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
  private func failed(_ value: Error) {
    if (value as NSError).code != NSURLErrorCancelled { error = value.localizedDescription }
    sync()
  }
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = action.request.url { navigate(url) }; return nil
  }
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    let scheme = navigationAction.request.url?.scheme?.lowercased() ?? ""
    decisionHandler(["http", "https", "file", "about", "blob", "data"].contains(scheme) ? .allow : .cancel)
  }
}
struct BrowserPane: View {
  @ObservedObject var session: BrowserSession
  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        Button { session.web.goBack() } label: { Image(systemName: "chevron.left") }.disabled(!session.canBack).help("Back")
        Button { session.web.goForward() } label: { Image(systemName: "chevron.right") }.disabled(!session.canForward).help("Forward")
        TextField("URL or search", text: $session.address).textFieldStyle(.roundedBorder).onSubmit { session.submit() }
        Button { if session.loading { session.web.stopLoading() } else { session.web.reload() } } label: { Image(systemName: session.loading ? "xmark" : "arrow.clockwise") }.help("Reload or stop")
      }.buttonStyle(.plain).padding(10)
      if let error = session.error { Text(error).font(.caption).foregroundStyle(.orange).textSelection(.enabled).padding(8) }
      BrowserSurface(session: session)
    }
  }
}
struct BrowserSurface: NSViewRepresentable {
  let session: BrowserSession
  func makeNSView(context: Context) -> WKWebView { session.web }
  func updateNSView(_ view: WKWebView, context: Context) {}
}

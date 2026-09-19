import SwiftUI
import AVFoundation

struct QRScanner: UIViewControllerRepresentable {
  var scanned: (String) -> Void
  func makeUIViewController(context: Context) -> ScannerController { let view = ScannerController(); view.scanned = scanned; return view }
  func updateUIViewController(_ uiViewController: ScannerController, context: Context) {}
  static func dismantleUIViewController(_ controller: ScannerController, coordinator: ()) { controller.stop() }
}
final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  var scanned: ((String) -> Void)?
  private let session = AVCaptureSession()
  private let queue = DispatchQueue(label: "app.localbot.camera")
  private var preview: AVCaptureVideoPreviewLayer?
  private var delivered = false
  // Accessed only on the capture queue; prevents permission replies restarting a dismissed camera.
  private var stopped = false
  override func viewDidLoad() {
    super.viewDidLoad(); view.backgroundColor = .black
    AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
      guard allowed else { DispatchQueue.main.async { self?.showUnavailable() }; return }
      self?.configure()
    }
  }
  private func configure() {
    queue.async { [weak self] in
      guard let self, !self.stopped, let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else { return }
      self.session.beginConfiguration(); self.session.addInput(input)
      let output = AVCaptureMetadataOutput()
      guard self.session.canAddOutput(output) else { self.session.commitConfiguration(); return }
      self.session.addOutput(output); output.setMetadataObjectsDelegate(self, queue: .main); output.metadataObjectTypes = [.qr]; self.session.commitConfiguration()
      DispatchQueue.main.async {
        let preview = AVCaptureVideoPreviewLayer(session: self.session); preview.videoGravity = .resizeAspectFill; preview.frame = self.view.bounds; self.view.layer.addSublayer(preview); self.preview = preview
      }
      self.session.startRunning()
    }
  }
  private func showUnavailable() {
    let label = UILabel(); label.text = "Camera access is unavailable. Paste the pairing code instead."; label.textColor = .white; label.numberOfLines = 0; label.textAlignment = .center; label.frame = view.bounds.insetBy(dx: 30, dy: 30); label.autoresizingMask = [.flexibleWidth,.flexibleHeight]; view.addSubview(label)
  }
  override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
  func stop() { queue.async { [weak self] in self?.stopped = true; self?.session.stopRunning() } }
  func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
    guard !delivered, let code = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue, code.hasPrefix("localbot://pair") else { return }
    delivered = true; stop(); scanned?(code)
  }
}

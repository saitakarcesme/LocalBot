import Foundation
@main struct Check {
  static func main() async {
    do {
      // Test fixture JSON is written with mode 0600 by the local test runner.
      // Production pairing always goes through PairingLink.parse's HTTPS checks.
      let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
      let link = try JSONDecoder().decode(PairingLink.self, from: data)
      let client = RemoteClient(link: link)
      _ = try await client.claim(name: "Swift protocol fixture")
      let result = try await client.api("/snapshot")
      let value = try JSONSerialization.jsonObject(with: result) as? [String:String]
      guard value?["fixture"] == "encrypted Swift to Node" else { throw RemoteError("Fixture mismatch") }
      print("PASS: Swift CryptoKit and Node AES-GCM pairing and response")
    } catch { print("FAIL: \(error.localizedDescription)"); exit(1) }
  }
}

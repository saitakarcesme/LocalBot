import Foundation
import CryptoKit

struct PairingLink: Codable {
  let v: Int
  let kind: String
  let url: String
  let id: String
  var token: String
  let key: String
  let name: String
  var expires: Double?
  static func parse(_ code: String) throws -> Self {
    guard let components = URLComponents(string: code.trimmingCharacters(in: .whitespacesAndNewlines)),
      components.scheme == "localbot", components.host == "pair",
      let encoded = components.queryItems?.first(where: { $0.name == "data" })?.value,
      encoded.count <= 8192 else { throw RemoteError("This is not a LocalBot pairing code.") }
    var base64 = encoded.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
    guard let data = Data(base64Encoded: base64) else { throw RemoteError("Invalid pairing code.") }
    let link = try JSONDecoder().decode(Self.self, from: data)
    guard link.v == 1, link.kind == "remote", Data(base64Encoded: link.key)?.count == 32,
      link.id.range(of: "^[a-zA-Z0-9_-]{20,80}$", options: .regularExpression) != nil,
      link.token.range(of: "^[a-zA-Z0-9_-]{32,100}$", options: .regularExpression) != nil,
      let url = URLComponents(string: link.url), url.scheme == "https", url.host != nil,
      url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
      url.path.isEmpty || url.path == "/" else { throw RemoteError("Use a valid secure iPhone pairing code.") }
    if let expiry = link.expires, expiry < Date().timeIntervalSince1970 * 1000 { throw RemoteError("This code expired. Generate a new one on your Mac.") }
    return link
  }
}
struct RemoteError: LocalizedError { let message: String; init(_ message: String) { self.message = message }; var errorDescription: String? { message } }
final class NoRemoteRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
actor RemoteClient {
  private var link: PairingLink
  private let session: URLSession
  init(link: PairingLink) {
    self.link = link
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 50
    configuration.timeoutIntervalForResource = 60
    session = URLSession(configuration: configuration, delegate: NoRemoteRedirects(), delegateQueue: nil)
  }
  func claim(name: String) async throws -> PairingLink {
    let data = try await invoke(operation: "claim", body: ["name": name])
    struct Claim: Decodable { let token: String }
    link.token = try JSONDecoder().decode(Claim.self, from: data).token
    link.expires = nil
    return link
  }
  func api(_ path: String, body: [String: Any]? = nil) async throws -> Data {
    try await invoke(operation: "api", path: path, body: body)
  }
  private func invoke(operation: String, path: String? = nil, body: [String:Any]? = nil) async throws -> Data {
    let requestID = UUID().uuidString.lowercased()
    let key = SymmetricKey(data: Data(base64Encoded: link.key)!)
    func aad(_ direction: String) -> Data { Data("localbot.v1|\(link.id)|\(requestID)|\(direction)".utf8) }
    var payload: [String:Any] = ["operation": operation, "timestamp": Date().timeIntervalSince1970 * 1000]
    if let path { payload["path"] = path; payload["method"] = body == nil ? "GET" : "POST" }
    if let body { payload["body"] = body }
    let box = try AES.GCM.seal(JSONSerialization.data(withJSONObject: payload), using: key, authenticating: aad("request"))
    guard let combined = box.combined, let url = URL(string: link.url + "/rpc") else { throw RemoteError("Invalid host address.") }
    var request = URLRequest(url: url); request.httpMethod = "POST"
    request.setValue("Bearer " + link.token, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["id":link.id,"requestId":requestID,"box":combined.base64EncodedString()])
    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
      if (response as? HTTPURLResponse)?.statusCode == 401 { throw RemoteError("Connection was revoked or expired. Pair with your Mac again.") }
      throw RemoteError("Cannot reach your Mac. Keep LocalBot open and Remote enabled.")
    }
    guard data.count < 16_000_000, let wire = try JSONSerialization.jsonObject(with: data) as? [String:String], let encrypted = wire["box"].flatMap({ Data(base64Encoded: $0) }) else { throw RemoteError("Invalid host response.") }
    let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: encrypted), using: key, authenticating: aad("response"))
    if let result = try JSONSerialization.jsonObject(with: plain) as? [String:Any], let error = result["error"] as? String { throw RemoteError(error) }
    return plain
  }
}

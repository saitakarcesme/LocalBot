import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import PhotosUI
#endif

struct ProfileBadge: View {
  var profile: UserProfile
  var body: some View {
    HStack(spacing: 9) {
      avatar.frame(width: 30, height: 30).clipShape(Circle())
      Text(profile.name).font(.callout).lineLimit(1)
    }.accessibilityLabel("Profile: " + profile.name)
  }
  @ViewBuilder var avatar: some View {
    if let encoded = profile.photo?.split(separator: ",").last, let data = Data(base64Encoded: String(encoded)) {
      #if os(iOS)
      if let image = UIImage(data: data) { Image(uiImage: image).resizable().scaledToFill() }
      #else
      if let image = NSImage(data: data) { Image(nsImage: image).resizable().scaledToFill() }
      #endif
    } else { Image(systemName: "person.crop.circle.fill").resizable().foregroundStyle(.secondary) }
  }
}
struct ProfileEditor: View {
  @Environment(\.dismiss) private var dismiss
  @State var profile: UserProfile
  var loadUsage: () async throws -> Data
  var save: (UserProfile) async throws -> Void
  @State private var usage: UsageSummary?
  @State private var error: String?
  @State private var busy = false
  @State private var pickFile = false
  #if os(iOS)
  @State private var photo: PhotosPickerItem?
  #endif
  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      HStack { Text("Profile & usage").font(.title2.bold()); Spacer(); Button("Done") { dismiss() } }
      ProfileBadge(profile: profile)
      TextField("Your name", text: $profile.name).textFieldStyle(.roundedBorder)
      HStack {
        #if os(iOS)
        PhotosPicker("Choose photo", selection: $photo, matching: .images)
          .onChange(of: photo) { _, item in Task { do { if let data = try await item?.loadTransferable(type: Data.self) { try setPhoto(data) } } catch { self.error = error.localizedDescription } } }
        #else
        Button("Choose photo") { pickFile = true }
        #endif
        if profile.photo != nil { Button("Remove photo") { profile.photo = nil } }
      }
      Divider()
      Text("Token usage").font(.headline)
      if let usage {
        Text(usage.tokens.map { $0.formatted() + " tokens" } ?? "No token data recorded yet").font(.title3.monospacedDigit())
        Text(usage.tokenNotice ?? "").font(.caption).foregroundStyle(.secondary)
        ForEach(usage.windows) { window in
          VStack(alignment: .leading) {
            Text(window.label).font(.callout)
            ProgressView(value: min(100, max(0, window.used)), total: 100)
            Text("\(Int(window.used))% used").font(.caption)
            if let reset = window.reset { Text("Resets " + Date(timeIntervalSince1970: reset).formatted()).font(.caption).foregroundStyle(.secondary) }
          }
        }
        Text(usage.notice ?? "").font(.caption).foregroundStyle(.secondary)
      } else { ProgressView("Loading usage…") }
      if let error { Text(error).font(.caption).foregroundStyle(.red) }
      HStack { Button("Refresh usage") { Task { await refresh() } }; Spacer(); Button("Save profile") { Task { busy = true; defer { busy = false }; do { try await save(profile); dismiss() } catch { self.error = error.localizedDescription } } }.buttonStyle(.borderedProminent).disabled(busy || profile.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
    }.padding(24)
      .frame(minWidth: 300, idealWidth: 420)
      .task { await refresh() }
      .fileImporter(isPresented: $pickFile, allowedContentTypes: [.jpeg, .png]) { result in do { let url = try result.get(); let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; try setPhoto(Data(contentsOf: url)) } catch { self.error = error.localizedDescription } }
  }
  private func refresh() async { do { usage = try JSONDecoder().decode(UsageSummary.self, from: await loadUsage()); error = nil } catch { self.error = error.localizedDescription; usage = UsageSummary() } }
  private func setPhoto(_ data: Data) throws {
    #if os(iOS)
    guard let image = UIImage(data: data) else { return }
    let format = UIGraphicsImageRendererFormat(); format.scale = 1
    let resized = UIGraphicsImageRenderer(size: CGSize(width: 160, height: 160), format: format).image { _ in image.draw(in: CGRect(x: 0, y: 0, width: 160, height: 160)) }
    guard let bytes = resized.jpegData(compressionQuality: 0.85) else { return }
    #else
    guard let image = NSImage(data: data) else { return }
    let resized = NSImage(size: NSSize(width: 160, height: 160)); resized.lockFocus(); image.draw(in: NSRect(x: 0,y: 0,width: 160,height: 160)); resized.unlockFocus()
    guard let tiff = resized.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let bytes = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else { return }
    #endif
    profile.photo = "data:image/jpeg;base64," + bytes.base64EncodedString()
  }
}
struct UsageSummary: Decodable {
  var tokens: Int?
  var tokenNotice: String?
  var notice: String?
  var rateLimits: Limits?
  var rateLimitsByLimitId: [String: Limits?]?
  struct Limits: Decodable { var primary: Window?; var secondary: Window? }
  struct Window: Decodable { var usedPercent: Double; var windowDurationMins: Int?; var resetsAt: Double? }
  struct DisplayWindow: Identifiable { var label: String; var used: Double; var reset: Double?; var id: String { label } }
  var windows: [DisplayWindow] {
    let buckets = rateLimitsByLimitId?.isEmpty == false ? rateLimitsByLimitId! : ["Codex": rateLimits]
    return buckets.keys.sorted().flatMap { key -> [DisplayWindow] in
      guard let limits = buckets[key] ?? nil else { return [] }
      return [limits.primary, limits.secondary].compactMap { $0 }.enumerated().map { index, window in
        DisplayWindow(label: key + " · " + (window.windowDurationMins.map { "\($0 / 60) hour window" } ?? "Window \(index + 1)"), used: window.usedPercent, reset: window.resetsAt)
      }
    }
  }
}

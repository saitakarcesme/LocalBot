// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "LocalBot", platforms: [.macOS(.v14)], products: [.executable(name: "LocalBot", targets: ["LocalBot"])], targets: [.executableTarget(name: "LocalBot", swiftSettings: [.swiftLanguageMode(.v5)])])

// swift-tools-version: 6.0
import PackageDescription
let package = Package(
  name: "LocalBot", platforms: [.macOS(.v14)],
  products: [.executable(name: "LocalBot", targets: ["LocalBot"])],
  dependencies: [.package(url: "https://github.com/migueldeicaza/SwiftTerm.git", exact: "1.13.0")],
  targets: [.executableTarget(name: "LocalBot", dependencies: [.product(name: "SwiftTerm", package: "SwiftTerm")], resources: [.copy("Resources/LocalBotMark.png")], swiftSettings: [.swiftLanguageMode(.v5)]), .testTarget(name: "LocalBotTests", dependencies: ["LocalBot"])]
)

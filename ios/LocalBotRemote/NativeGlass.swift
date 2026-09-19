import SwiftUI
struct NativeGlass: ViewModifier {
  var radius: CGFloat = 26
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  func body(content: Content) -> some View {
    if reduceTransparency { content.background(Color(uiColor:.secondarySystemBackground),in:RoundedRectangle(cornerRadius:radius)) }
    else if #available(iOS 26.0, *) { content.glassEffect(.regular,in:.rect(cornerRadius:radius)) }
    else { content.background(.regularMaterial,in:RoundedRectangle(cornerRadius:radius)) }
  }
}

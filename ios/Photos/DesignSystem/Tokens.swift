import SwiftUI

/// Standard system components (NavigationStack, TabView, toolbars, sheets)
/// already render with Liquid Glass automatically on iOS 26 - no extra code
/// needed there. These tokens only cover spacing/radii for custom layout;
/// Components/Glass.swift covers the floating controls that need an explicit
/// .glassEffect().
enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 40
}

enum Radius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 14
    static let lg: CGFloat = 22
}

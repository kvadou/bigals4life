import SwiftUI

struct BA4LBrandMark: View {
    var size: CGFloat = 40
    var body: some View {
        Image("BA4LMark").resizable().scaledToFit()
            .frame(width: size, height: size).accessibilityHidden(true)
    }
}

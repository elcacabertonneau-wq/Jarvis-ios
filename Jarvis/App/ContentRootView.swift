import SwiftUI

struct ContentRootView: View {
    @EnvironmentObject var jarvisManager: JarvisManager
    @State private var showSplash = true

    var body: some View {
        ZStack {
            if showSplash {
                SplashView()
                    .transition(.opacity)
            } else {
                MainView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.8), value: showSplash)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                showSplash = false
            }
        }
        .ignoresSafeArea()
    }
}

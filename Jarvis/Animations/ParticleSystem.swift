import SwiftUI

struct Particle: Identifiable {
    let id = UUID()
    var x: CGFloat
    var y: CGFloat
    var opacity: Double
    var scale: CGFloat
    var speed: CGFloat
    var angle: CGFloat
    var size: CGFloat
    var color: Color
}

struct ParticleSystemView: View {
    let isActive: Bool
    let color: Color
    let count: Int

    @State private var particles: [Particle] = []
    @State private var animationPhase: Double = 0

    init(isActive: Bool = true, color: Color = AppConstants.Colors.primaryCyan, count: Int = 60) {
        self.isActive = isActive
        self.color = color
        self.count = count
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(particles) { particle in
                    Circle()
                        .fill(particle.color)
                        .frame(width: particle.size, height: particle.size)
                        .position(x: particle.x, y: particle.y)
                        .opacity(particle.opacity)
                        .scaleEffect(particle.scale)
                        .blur(radius: particle.size * 0.3)
                }
            }
            .onAppear {
                initializeParticles(in: geometry.size)
                startAnimation(in: geometry.size)
            }
            .onChange(of: isActive) { newValue in
                if newValue {
                    startAnimation(in: geometry.size)
                }
            }
        }
    }

    private func initializeParticles(in size: CGSize) {
        particles = (0..<count).map { _ in
            createParticle(in: size)
        }
    }

    private func createParticle(in size: CGSize) -> Particle {
        let colors: [Color] = [
            color,
            color.opacity(0.7),
            AppConstants.Colors.secondaryCyan,
            AppConstants.Colors.accentBlue
        ]

        return Particle(
            x: CGFloat.random(in: 0...size.width),
            y: CGFloat.random(in: 0...size.height),
            opacity: Double.random(in: 0.1...0.8),
            scale: CGFloat.random(in: 0.3...1.2),
            speed: CGFloat.random(in: 0.5...2.0),
            angle: CGFloat.random(in: 0...(.pi * 2)),
            size: CGFloat.random(in: 1...4),
            color: colors.randomElement() ?? color
        )
    }

    private func startAnimation(in size: CGSize) {
        let displayLink = CADisplayLink.init(target: ParticleUpdater(), selector: #selector(ParticleUpdater.update))
        _ = displayLink

        Timer.scheduledTimer(withTimeInterval: 0.033, repeats: true) { [self] timer in
            guard isActive else { timer.invalidate(); return }
            withAnimation(.linear(duration: 0.033)) {
                updateParticles(in: size)
            }
        }
    }

    private func updateParticles(in size: CGSize) {
        for i in particles.indices {
            let dx = cos(particles[i].angle) * particles[i].speed
            let dy = sin(particles[i].angle) * particles[i].speed - 0.3

            particles[i].x += dx
            particles[i].y += dy
            particles[i].opacity -= 0.003

            if particles[i].opacity <= 0 || particles[i].y < 0 {
                particles[i] = createParticle(in: size)
                particles[i].y = size.height
            }
        }
    }
}

private class ParticleUpdater: NSObject {
    @objc func update() {}
}

struct FloatingParticle: View {
    let color: Color
    @State private var offset: CGSize = .zero
    @State private var opacity: Double = 0
    @State private var scale: CGFloat = 0.5

    let startX: CGFloat
    let startY: CGFloat

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: CGFloat.random(in: 2...5), height: CGFloat.random(in: 2...5))
            .position(x: startX + offset.width, y: startY + offset.height)
            .opacity(opacity)
            .scaleEffect(scale)
            .onAppear { animate() }
    }

    private func animate() {
        let duration = Double.random(in: 2...5)
        withAnimation(.easeInOut(duration: duration).repeatForever(autoreverses: true)) {
            offset = CGSize(
                width: CGFloat.random(in: -30...30),
                height: CGFloat.random(in: -50...10)
            )
            opacity = Double.random(in: 0.3...0.9)
            scale = CGFloat.random(in: 0.8...1.5)
        }
    }
}

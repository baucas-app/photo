import SceneKit
import SwiftUI

/// 360°/panorama viewer (`Asset.is360`, docs/DONE.md Teil 7): the
/// equirectangular photo is mapped onto the inside of a sphere with the
/// camera at its centre, freely pannable with a finger - SceneKit's own
/// camera controller does the look-around, so there's no custom touch math.
struct Panorama360View: View {
    let asset: Asset

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            if let image {
                PanoramaSceneView(image: image)
            } else if failed {
                Image(systemName: "exclamationmark.triangle").foregroundStyle(.white)
            } else {
                ProgressView().tint(.white)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: asset.id) { await load() }
    }

    /// The full-resolution original can be tens of megapixels for a
    /// panorama - `/preview` (max 2048px JPEG) is plenty for a phone screen
    /// and far lighter as a live SceneKit texture.
    private func load() async {
        image = nil
        failed = false
        guard let url = APIClient.previewURL(for: asset) ?? APIClient.fileURL(for: asset) else {
            failed = true
            return
        }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let decoded = UIImage(data: data) else {
                failed = true
                return
            }
            image = decoded
        } catch {
            failed = true
        }
    }
}

private struct PanoramaSceneView: UIViewRepresentable {
    let image: UIImage

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.scene = Self.makeScene(image: image)
        view.backgroundColor = .black
        view.allowsCameraControl = true
        // .fly keeps the camera fixed at the sphere's centre and just turns
        // it to look around (like a first-person mouselook), instead of
        // orbiting *around* a target point the way the other interaction
        // modes do - the right fit for standing inside a photo sphere.
        view.defaultCameraController.interactionMode = .fly
        view.defaultCameraController.inertiaEnabled = true
        view.defaultCameraController.maximumVerticalAngle = 89
        view.defaultCameraController.minimumVerticalAngle = -89
        return view
    }

    func updateUIView(_ uiView: SCNView, context: Context) {}

    private static func makeScene(image: UIImage) -> SCNScene {
        let scene = SCNScene()

        let sphere = SCNSphere(radius: 10)
        sphere.segmentCount = 96
        let material = SCNMaterial()
        material.diffuse.contents = image
        material.diffuse.wrapS = .repeat
        // Equirectangular textures read mirrored from inside the sphere -
        // flip horizontally so the panorama isn't left/right reversed.
        material.diffuse.contentsTransform = SCNMatrix4MakeScale(-1, 1, 1)
        // Show the inside of the sphere (we're standing inside it), not the
        // outside - cull the front-facing winding instead of the back.
        material.cullMode = .front
        // No scene lighting needed (or wanted): render the photo at its own
        // brightness, not shaded by a virtual light.
        material.lightingModel = .constant
        sphere.materials = [material]
        scene.rootNode.addChildNode(SCNNode(geometry: sphere))

        let camera = SCNCamera()
        camera.fieldOfView = 80
        let cameraNode = SCNNode()
        cameraNode.camera = camera
        cameraNode.position = SCNVector3Zero
        scene.rootNode.addChildNode(cameraNode)

        return scene
    }
}

import {
  Scene,
  SceneLoader,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  AbstractMesh,
  type Mesh,
  type ISceneLoaderProgressEvent,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';


export interface ModelLoadResult {
  meshes: AbstractMesh[];
  shadowCasters: AbstractMesh[];
  center: Vector3;
  diagonal: number;
  /** Model bounding-box size (max − min) in world units. */
  size: Vector3;
}

export interface LoadModelOptions {
  /** When true, keep original textured materials and skip the white cartoon edges. */
  showTextures?: boolean;
  /** Base color of the cartoon material when textures are off (hex string, e.g. "#ffffff"). */
  sketchColor?: string;
  /** Specular intensity (0..1) of the cartoon material; applied as uniform grayscale. */
  sketchSpecular?: number;
}

function hexToColor3(hex: string): Color3 {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16);
  return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function loadModel(
  scene: Scene,
  source: string | Blob,
  onProgress?: (percent: number) => void,
  options?: LoadModelOptions,
): Promise<ModelLoadResult> {
  let dir: string;
  let file: string;
  let blobUrl: string | null = null;

  if (source instanceof Blob) {
    blobUrl = URL.createObjectURL(source);
    dir = '';
    file = blobUrl;
    // Revoke on scene dispose (not earlier — Babylon may reference the URL async for textures)
    scene.onDisposeObservable.addOnce(() => { if (blobUrl) URL.revokeObjectURL(blobUrl); });
  } else {
    dir = source.substring(0, source.lastIndexOf('/') + 1) || './';
    file = source.substring(source.lastIndexOf('/') + 1);
  }

  const t0 = performance.now();
  const result = await SceneLoader.ImportMeshAsync(
    '',
    dir,
    file,
    scene,
    (evt: ISceneLoaderProgressEvent) => {
      if (evt.lengthComputable && onProgress) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    },
    blobUrl ? '.glb' : undefined, // hint Babylon to use the glTF loader for blob URLs
  );
  console.log(`[ModelLoader] loaded in ${(performance.now() - t0).toFixed(0)}ms`);

  // Calculate bounding box and collect solid meshes
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  const solidMeshes: AbstractMesh[] = [];

  result.meshes.forEach((m) => {
    if (!(m instanceof AbstractMesh)) return;
    if (!m.getTotalVertices || m.getTotalVertices() === 0) return;
    try {
      const b = m.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, b.minimumWorld);
      max = Vector3.Maximize(max, b.maximumWorld);
    } catch {
      return;
    }
    m.receiveShadows = true;
    solidMeshes.push(m);
  });

  let center = Vector3.Lerp(min, max, 0.5);
  let diagonal = Vector3.Distance(min, max);

  // Auto-scale: if model is in millimeters (diagonal > 100), convert to meters
  if (diagonal > 100) {
    const scaleFactor = 0.001;

    const rootMesh = result.meshes[0];
    rootMesh.scaling.scaleInPlace(scaleFactor);

    // Force world matrix recalculation on all meshes
    scene.meshes.forEach((m) => m.computeWorldMatrix(true));

    // Recompute bounding box with new world positions
    min = new Vector3(Infinity, Infinity, Infinity);
    max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of solidMeshes) {
      m.refreshBoundingInfo({});
      const b = m.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, b.minimumWorld);
      max = Vector3.Maximize(max, b.maximumWorld);
    }
    center = Vector3.Lerp(min, max, 0.5);
    diagonal = Vector3.Distance(min, max);

  }

  // Disable lights imported from the model (e.g. UE lights)
  scene.lights
    .filter((l) => l.name !== 'sun' && l.name !== 'hemi')
    .forEach((l) => l.setEnabled(false));

  // Apply white cartoon style or keep original textures depending on user setting.
  applyRenderStyle(scene, solidMeshes, {
    showTextures: options?.showTextures ?? false,
    sketchColor: options?.sketchColor ?? '#ffffff',
    sketchSpecular: options?.sketchSpecular ?? 0.1,
  });

  const shadowCasters: AbstractMesh[] = [...solidMeshes];

  const size = max.subtract(min);
  return { meshes: result.meshes, shadowCasters, center, diagonal, size };
}

const CARTOON_MAT_NAME = 'cartoon_white';

function getOrCreateCartoonMaterial(scene: Scene): StandardMaterial {
  const existing = scene.getMaterialByName(CARTOON_MAT_NAME);
  if (existing) return existing as StandardMaterial;
  // Shared StandardMaterial (more robust than PBR for CAD exports lacking normals/UVs)
  const mat = new StandardMaterial(CARTOON_MAT_NAME, scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  mat.maxSimultaneousLights = 48;
  return mat;
}

/**
 * Update the cartoon material's diffuse and specular at runtime.
 * `sketchSpecular` is applied as a uniform grayscale on all three channels.
 */
export function setSketchAppearance(scene: Scene, sketchColor: string, sketchSpecular: number): void {
  const mat = getOrCreateCartoonMaterial(scene);
  mat.diffuseColor = hexToColor3(sketchColor);
  const s = Math.max(0, Math.min(1, sketchSpecular));
  mat.specularColor = new Color3(s, s, s);
}

interface RenderStyleOptions {
  showTextures: boolean;
  sketchColor: string;
  sketchSpecular: number;
}

/**
 * Apply either the cartoon (sketch) style or the original textured materials.
 * Stores each mesh's original material once so the modes can be toggled at runtime.
 */
function applyRenderStyle(scene: Scene, meshes: AbstractMesh[], opts: RenderStyleOptions): void {
  setSketchAppearance(scene, opts.sketchColor, opts.sketchSpecular);
  const cartoonMat = getOrCreateCartoonMaterial(scene);

  for (const mesh of meshes) {
    if (!mesh.metadata) mesh.metadata = {};
    if (mesh.metadata.originalMaterial === undefined) {
      mesh.metadata.originalMaterial = mesh.material;
    }
    mesh.applyFog = false; // fog is only for the ground grid fade

    if (opts.showTextures) {
      const orig = mesh.metadata.originalMaterial;
      if (orig) mesh.material = orig;
      mesh.disableEdgesRendering();
    } else {
      mesh.material = cartoonMat;
      // Per-mesh edges for outer corners (inner corners handled by EdgeOutline post-process)
      mesh.enableEdgesRendering();
      mesh.edgesWidth = 3;
      mesh.edgesColor = new Color4(0, 0, 0, 1);
    }
  }
}

/**
 * Toggle the textured / sketch render style on already-loaded meshes.
 * Restores original materials when enabled, or re-applies the cartoon white + black edges when disabled.
 */
export function setTexturesEnabled(
  scene: Scene,
  meshes: AbstractMesh[],
  enabled: boolean,
  edgeWidth: number,
): void {
  const whiteMat = getOrCreateCartoonMaterial(scene);
  for (const mesh of meshes) {
    if (enabled) {
      const orig = mesh.metadata?.originalMaterial;
      if (orig) mesh.material = orig;
      mesh.disableEdgesRendering();
    } else {
      mesh.material = whiteMat;
      mesh.enableEdgesRendering();
      mesh.edgesWidth = edgeWidth;
      mesh.edgesColor = new Color4(0, 0, 0, 1);
    }
  }
}

/**
 * Create invisible shadow wall meshes from config.
 * Hidden from the camera via layerMask but included in the shadow generator.
 */
export function createShadowWalls(
  scene: Scene,
  walls: Array<{ position: { x: number; y: number; z: number }; size: { width: number; height: number; depth: number } }>,
): Mesh[] {
  const mat = new StandardMaterial('shadow_wall_mat', scene);
  mat.disableLighting = true;

  return walls.map((w, i) => {
    const mesh = MeshBuilder.CreateBox(`shadow_wall_${i}`, {
      width: w.size.width,
      height: w.size.height,
      depth: w.size.depth,
    }, scene);
    mesh.position = new Vector3(w.position.x, w.position.y, w.position.z);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    // Hidden from camera but visible to shadow generator
    mesh.layerMask = 0x10000000;
    mesh.material = mat;
    return mesh;
  });
}

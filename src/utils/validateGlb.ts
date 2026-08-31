/**
 * Structural validation of a GLB (binary glTF) file before it is accepted.
 * Checks the 12-byte header and the chunk layout without parsing the scene,
 * so it is fast even for large files.
 *
 * GLB layout (glTF 2.0 spec):
 *   uint32 magic   = 0x46546C67 ("glTF")
 *   uint32 version = 2
 *   uint32 length  = total file size in bytes
 *   then one or more chunks: uint32 chunkLength, uint32 chunkType, data
 *   first chunk must be JSON (0x4E4F534A "JSON")
 */

export interface GlbValidationResult {
  valid: boolean;
  error?: string;
  /** Parsed asset info when available (generator, version). */
  generator?: string;
  /** Number of meshes declared in the JSON chunk. */
  meshCount?: number;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

export async function validateGlb(file: Blob): Promise<GlbValidationResult> {
  if (file.size < 20) {
    return { valid: false, error: 'File is too small to be a GLB model.' };
  }

  // Header + first chunk header (20 bytes)
  const head = new DataView(await file.slice(0, 20).arrayBuffer());

  if (head.getUint32(0, true) !== GLB_MAGIC) {
    return { valid: false, error: 'Not a binary glTF file (missing "glTF" magic). Export as .glb, not .gltf.' };
  }
  const version = head.getUint32(4, true);
  if (version !== 2) {
    return { valid: false, error: `Unsupported glTF version ${version} (expected 2).` };
  }
  const declaredLength = head.getUint32(8, true);
  if (declaredLength > file.size) {
    return { valid: false, error: 'File is truncated (declared length exceeds actual size).' };
  }

  const jsonChunkLength = head.getUint32(12, true);
  if (head.getUint32(16, true) !== CHUNK_JSON) {
    return { valid: false, error: 'Malformed GLB: first chunk is not JSON.' };
  }
  if (20 + jsonChunkLength > file.size) {
    return { valid: false, error: 'Malformed GLB: JSON chunk extends past end of file.' };
  }

  // Parse the JSON chunk for basic sanity + useful info
  try {
    const jsonText = await file.slice(20, 20 + jsonChunkLength).text();
    const gltf = JSON.parse(jsonText) as {
      asset?: { generator?: string; version?: string };
      meshes?: unknown[];
      scenes?: unknown[];
    };
    if (!gltf.asset?.version) {
      return { valid: false, error: 'Malformed GLB: missing asset descriptor.' };
    }
    const meshCount = gltf.meshes?.length ?? 0;
    if (meshCount === 0) {
      return { valid: false, error: 'The model contains no meshes — nothing to display.' };
    }
    return { valid: true, generator: gltf.asset.generator, meshCount };
  } catch {
    return { valid: false, error: 'Malformed GLB: JSON chunk is not valid JSON.' };
  }
}

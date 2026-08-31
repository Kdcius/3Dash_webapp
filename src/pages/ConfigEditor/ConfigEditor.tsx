import { useRef, useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { generateUUID } from '../../utils/uuid';
import {
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  PositionGizmo,
  UtilityLayerRenderer,
  Color4,
  Animation,
  CubicEase,
  EasingFunction,
  Tools,
  type Mesh,
  type LinesMesh,
  type Observer,
  type Scene,
} from '@babylonjs/core';
import { createScene, type SceneContext } from '../../babylon/SceneManager';
import { loadModel } from '../../babylon/ModelLoader';
import { createEdgeOutline } from '../../babylon/EdgeOutline';
import { removeLightMesh, rebuildAllMeshes, type MeshMap } from '../../babylon/LightMeshFactory';
import {
  createDisplayMesh,
  removeDisplayMesh,
  rebuildAllDisplayMeshes,
  updateDisplayTexture,
  buildMockupStates,
  type DisplayMeshMap,
} from '../../babylon/DisplayMeshFactory';
import { getConfig, updateConfig, getModelBlob } from '../../services/configApi';
import { fetchModelFromHA } from '../../services/haSync';
import { getSetting } from '../../services/settingsStore';
import { getEntityCache, setEntityCache } from '../../services/entityCache';
import { HAConnection } from '../../services/haWebSocket';
import type { HAEntityOption } from '../../components/EntityPicker';
import LightList from '../../components/LightList';
import LightForm, { type PreviewInfo, type LightFormHandle } from '../../components/LightForm';
import DisplayList from '../../components/DisplayList';
import DisplayForm, { type DisplayPreviewInfo } from '../../components/DisplayForm';
import ShadowWallList from '../../components/ShadowWallList';
import ShadowWallForm, { type WallPreviewInfo } from '../../components/ShadowWallForm';
import { arrayMove } from '@dnd-kit/sortable';
import TubeList from '../../components/TubeList';
import TubeForm, { type TubePreviewInfo } from '../../components/TubeForm';
import { createTubeMeshes, removeTubeMeshes, disposeAllTubes, renderMockupLabels, type TubeMap } from '../../babylon/TubeMeshFactory';
import GuidedTour from '../../components/GuidedTour/GuidedTour';
import { editorTourSteps } from '../../components/GuidedTour/tourSteps';
import type { LightConfig, LightGroup, DisplayConfig, ShadowWallConfig, TubeConfig, LightPosition, HAState } from '../../types';
import './ConfigEditor.css';

export default function ConfigEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showGuidedTour, setShowGuidedTour] = useState(() => searchParams.get('guided') === 'true');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneCtxRef = useRef<SceneContext | null>(null);
  const homingRef = useRef(false);
  const homeTargetRef = useRef<Vector3 | null>(null);
  const modelSizeRef = useRef<{ x: number; z: number } | null>(null);
  const modelDiagonalRef = useRef(1);
  const meshMapRef = useRef<MeshMap>({});
  const previewMeshRef = useRef<Mesh | null>(null);
  const extraPreviewMeshesRef = useRef<Mesh[]>([]);
  const hitboxPreviewRef = useRef<Mesh | null>(null);
  const previewObsRef = useRef<Observer<Scene> | null>(null);
  const gizmoRef = useRef<PositionGizmo | null>(null);
  const utilLayerRef = useRef<UtilityLayerRenderer | null>(null);
  const draggingGizmoRef = useRef(false);
  const posUndoStackRef = useRef<LightPosition[]>([]);
  const gizmoTargetRef = useRef<'main' | { type: 'part'; index: number } | { type: 'hitbox' }>('main');
  const skipPreviewRebuildRef = useRef(false);
  const lightFormRef = useRef<LightFormHandle>(null);
  const tubeAnchorRef = useRef<Mesh | null>(null);

  const [haEntities, setHaEntities] = useState<HAEntityOption[]>(() => getEntityCache());
  const [lights, setLights] = useState<LightConfig[]>([]);
  const [lightGroups, setLightGroups] = useState<LightGroup[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [placingMode, setPlacingMode] = useState(false);
  const [position, setPosition] = useState<LightPosition>({ x: 0, y: 2.5, z: 0 });
  const [coordText, setCoordText] = useState('x: \u2014  z: \u2014  y: \u2014');
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // Editor mode: lights, displays, walls, or tubes
  const [editorMode, setEditorMode] = useState<'lights' | 'displays' | 'walls' | 'tubes'>('lights');

  // Load HA entity list for autocomplete in forms (cache-first, else fetch fresh).
  useEffect(() => {
    if (haEntities.length > 0) return;
    const { mode, haSettings } = getSetting('connection');
    if (mode !== 'live' || !haSettings.url || !haSettings.token) return;
    const conn = new HAConnection(
      { url: haSettings.url, port: haSettings.port, token: haSettings.token },
      {
        onInitialStates: (states: HAState[]) => {
          const entities: HAEntityOption[] = states
            .map(s => ({ entity_id: s.entity_id, friendly_name: s.attributes.friendly_name as string | undefined }))
            .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
          setEntityCache(entities);
          setHaEntities(entities);
          conn.dispose();
        },
      },
    );
    conn.connect();
    return () => conn.dispose();
  }, [haEntities.length]);

  // Display state
  const displayMeshMapRef = useRef<DisplayMeshMap>({});
  const [displays, setDisplays] = useState<DisplayConfig[]>([]);
  const [displayEditIdx, setDisplayEditIdx] = useState<number | null>(null);
  const [displayPanelOpen, setDisplayPanelOpen] = useState(false);
  const [displayNormal, setDisplayNormal] = useState<LightPosition>({ x: 0, y: 0, z: 1 });
  const displaysRef = useRef(displays);
  displaysRef.current = displays;
  const displayPanelOpenRef = useRef(displayPanelOpen);
  displayPanelOpenRef.current = displayPanelOpen;
  const displayPreviewIdRef = useRef<string | null>(null);
  const displayNormalRef = useRef(displayNormal);
  displayNormalRef.current = displayNormal;
  const displayOutlineRef = useRef<LinesMesh | null>(null);

  // Shadow wall state
  const [shadowWalls, setShadowWalls] = useState<ShadowWallConfig[]>([]);
  const [wallEditIdx, setWallEditIdx] = useState<number | null>(null);
  const [wallPanelOpen, setWallPanelOpen] = useState(false);
  const wallPanelOpenRef = useRef(wallPanelOpen);
  wallPanelOpenRef.current = wallPanelOpen;
  const shadowWallsRef = useRef(shadowWalls);
  shadowWallsRef.current = shadowWalls;
  // Pink wireframe meshes shown in the editor when walls tab is active
  const wallEditorMeshesRef = useRef<Mesh[]>([]);
  const wallPreviewInfoRef = useRef<WallPreviewInfo>({ size: { width: 5, height: 0.05, depth: 5 } });

  // Tube state
  const tubeMeshMapRef = useRef<TubeMap>({});
  const [tubes, setTubes] = useState<TubeConfig[]>([]);
  const [tubeEditIdx, setTubeEditIdx] = useState<number | null>(null);
  const [tubePanelOpen, setTubePanelOpen] = useState(false);
  const tubePanelOpenRef = useRef(tubePanelOpen);
  tubePanelOpenRef.current = tubePanelOpen;
  const tubesRef = useRef(tubes);
  tubesRef.current = tubes;
  const tubePreviewInfoRef = useRef<TubePreviewInfo | null>(null);

  // Current preview shape/size from LightForm
  const previewInfoRef = useRef<PreviewInfo>({ shape: 'sphere', size: { diameter: 0.25 } });

  // Refs for current values accessible in Babylon callbacks
  const lightsRef = useRef(lights);
  lightsRef.current = lights;
  const placingModeRef = useRef(placingMode);
  placingModeRef.current = placingMode;
  const positionRef = useRef(position);
  positionRef.current = position;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);


  // Tour event: switch back to lights tab
  useEffect(() => {
    const handler = () => setEditorMode('lights');
    document.addEventListener('tour:switch-to-lights', handler);
    return () => document.removeEventListener('tour:switch-to-lights', handler);
  }, []);

  // Preview mesh management
  const clearPreview = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (previewObsRef.current && scene) {
      scene.onBeforeRenderObservable.remove(previewObsRef.current);
      previewObsRef.current = null;
    }
    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    if (previewMeshRef.current) {
      previewMeshRef.current.dispose();
      previewMeshRef.current = null;
    }
    for (const m of extraPreviewMeshesRef.current) m.dispose();
    extraPreviewMeshesRef.current = [];
    if (hitboxPreviewRef.current) {
      hitboxPreviewRef.current.dispose();
      hitboxPreviewRef.current = null;
    }
    if (tubeAnchorRef.current) {
      tubeAnchorRef.current.material?.dispose();
      tubeAnchorRef.current.dispose();
      tubeAnchorRef.current = null;
    }
    // Hide any previously shown hitbox mesh
    for (const entry of Object.values(meshMapRef.current)) {
      if (entry.hitboxMesh) entry.hitboxMesh.visibility = 0;
    }
  }, []);

  // Display edit outline — purple wireframe rectangle around the display plane
  const clearDisplayOutline = useCallback(() => {
    if (displayOutlineRef.current) {
      displayOutlineRef.current.dispose();
      displayOutlineRef.current = null;
    }
  }, []);

  const showDisplayOutline = useCallback((plane: Mesh) => {
    clearDisplayOutline();
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    // Get the plane's local bounding extents
    const bounds = plane.getBoundingInfo().boundingBox;
    const min = bounds.minimum;
    const max = bounds.maximum;

    // Build a rectangle in local space (4 corners + close)
    const corners = [
      new Vector3(min.x, min.y, 0),
      new Vector3(max.x, min.y, 0),
      new Vector3(max.x, max.y, 0),
      new Vector3(min.x, max.y, 0),
      new Vector3(min.x, min.y, 0),
    ];

    const purple = new Color4(1, 0.2, 0.8, 1);
    const outline = MeshBuilder.CreateLines('display-outline', {
      points: corners,
      colors: corners.map(() => purple),
    }, scene);
    outline.parent = plane;
    outline.isPickable = false;
    displayOutlineRef.current = outline;
  }, [clearDisplayOutline]);

  // Build pink wireframe meshes for all shadow walls (editor only)
  const rebuildWallEditorMeshes = useCallback((walls: ShadowWallConfig[]) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    // Dispose old
    for (const m of wallEditorMeshesRef.current) m.dispose();
    wallEditorMeshesRef.current = [];

    const mat = new StandardMaterial('wall_editor_mat', scene);
    mat.emissiveColor = new Color3(1, 0.2, 0.8);
    mat.alpha = 0.3;
    mat.wireframe = true;
    mat.disableLighting = true;

    for (const w of walls) {
      const mesh = MeshBuilder.CreateBox(`wall_editor_${w.id}`, {
        width: w.size.width,
        height: w.size.height,
        depth: w.size.depth,
      }, scene);
      mesh.position = new Vector3(w.position.x, w.position.y, w.position.z);
      mesh.material = mat;
      mesh.isPickable = false;
      wallEditorMeshesRef.current.push(mesh);
    }
  }, []);

  const disposeWallEditorMeshes = useCallback(() => {
    for (const m of wallEditorMeshesRef.current) m.dispose();
    wallEditorMeshesRef.current = [];
  }, []);

  const updatePreviewMesh = useCallback(
    (pos: LightPosition, shapeType: string, sizeOverrides: Record<string, number>, hitboxInfo?: { shape: string; size: Record<string, number>; position: LightPosition }, partsInfo?: Array<{ shape: string; size: Record<string, number>; position: LightPosition }>) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      clearPreview();

      const mat = new StandardMaterial('preview-mat', scene);
      mat.emissiveColor = new Color3(0.2, 0.7, 1.0);
      mat.alpha = 0.7;
      mat.disableLighting = true;

      const createPreviewShape = (name: string, sh: string, sz: Record<string, number>, p: LightPosition): Mesh => {
        let m: Mesh;
        if (sh === 'cube') {
          m = MeshBuilder.CreateBox(name, {
            width: sz.width ?? 0.3,
            height: sz.height ?? 0.3,
            depth: sz.depth ?? 0.3,
          }, scene);
        } else {
          m = MeshBuilder.CreateSphere(name, {
            diameter: sz.diameter ?? 0.25,
          }, scene);
        }
        m.position = new Vector3(p.x, p.y, p.z);
        m.isPickable = true;
        m.material = mat;
        return m;
      };

      let mesh: Mesh;
      if (partsInfo && partsInfo.length > 0) {
        // Multi-part preview
        mesh = createPreviewShape('preview_0', partsInfo[0].shape, partsInfo[0].size, partsInfo[0].position);
        mesh.metadata = { previewTarget: 'part', partIndex: 0 };
        for (let i = 1; i < partsInfo.length; i++) {
          const extra = createPreviewShape(`preview_${i}`, partsInfo[i].shape, partsInfo[i].size, partsInfo[i].position);
          extra.metadata = { previewTarget: 'part', partIndex: i };
          extraPreviewMeshesRef.current.push(extra);
        }
      } else {
        mesh = createPreviewShape('preview', shapeType, sizeOverrides, pos);
        mesh.metadata = { previewTarget: 'main' };
      }

      // Create hitbox preview if custom hitbox is enabled
      if (hitboxInfo) {
        let hbMesh: Mesh;
        if (hitboxInfo.shape === 'cube') {
          hbMesh = MeshBuilder.CreateBox('hitbox-preview', {
            width: hitboxInfo.size.width ?? 0.5,
            height: hitboxInfo.size.height ?? 0.5,
            depth: hitboxInfo.size.depth ?? 0.5,
          }, scene);
        } else {
          hbMesh = MeshBuilder.CreateSphere('hitbox-preview', {
            diameter: hitboxInfo.size.diameter ?? 0.5,
          }, scene);
        }
        const hbPos = hitboxInfo.position;
        hbMesh.position = new Vector3(hbPos.x, hbPos.y, hbPos.z);
        hbMesh.isPickable = true;
        hbMesh.metadata = { previewTarget: 'hitbox' };
        const hbMat = new StandardMaterial('hitbox-preview-mat', scene);
        hbMat.emissiveColor = new Color3(1, 0.2, 0.8); // magenta
        hbMat.alpha = 0.3;
        hbMat.wireframe = true;
        hbMat.disableLighting = true;
        hbMesh.material = hbMat;
        hitboxPreviewRef.current = hbMesh;
      }

      // Pulse animation
      let t = 0;
      previewObsRef.current = scene.onBeforeRenderObservable.add(() => {
        t += 0.05;
        mat.alpha = 0.5 + 0.25 * Math.sin(t);
      });

      previewMeshRef.current = mesh;
      gizmoTargetRef.current = partsInfo?.length ? { type: 'part', index: 0 } : 'main';

      // Attach position gizmo (RGB XYZ handles)
      if (!utilLayerRef.current) {
        utilLayerRef.current = new UtilityLayerRenderer(scene);
      }
      const gizmo = new PositionGizmo(utilLayerRef.current);
      gizmo.scaleRatio = 1.2;
      gizmo.attachedMesh = mesh;

      // Sync position back to React state on drag
      const onDragStart = () => {
        draggingGizmoRef.current = true;
        const target = gizmoTargetRef.current;
        if (target === 'main' || (typeof target === 'object' && target.type === 'part' && target.index === 0 && !(previewInfoRef.current.parts?.length))) {
          posUndoStackRef.current.push({ ...positionRef.current });
        }
      };
      const onDrag = () => {
        const target = gizmoTargetRef.current;
        // Only sync main light position to React state during drag
        if (target === 'main') {
          const p = mesh.position;
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          positionRef.current = newPos;
          setPosition(newPos);
        }
        // For part/hitbox targets, the mesh moves via gizmo — no state update during drag
      };
      const onDragEnd = () => {
        draggingGizmoRef.current = false;
        document.dispatchEvent(new Event('tour:gizmo-used'));
        const target = gizmoTargetRef.current;
        if (target !== 'main' && gizmo.attachedMesh) {
          const p = gizmo.attachedMesh.position;
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          skipPreviewRebuildRef.current = true;
          if (typeof target === 'object' && target.type === 'part') {
            lightFormRef.current?.updatePartPosition(target.index, newPos);
          } else if (typeof target === 'object' && target.type === 'hitbox') {
            lightFormRef.current?.updateHitboxPosition(newPos);
          }
        }
      };
      for (const ax of [gizmo.xGizmo, gizmo.yGizmo, gizmo.zGizmo]) {
        ax.dragBehavior.onDragStartObservable.add(onDragStart);
        ax.dragBehavior.onDragObservable.add(onDrag);
        ax.dragBehavior.onDragEndObservable.add(onDragEnd);
      }
      // Make gizmo arrows semi-transparent
      for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
        if (m.material) {
          (m.material as StandardMaterial).alpha = 0.5;
        }
      }

      gizmoRef.current = gizmo;
    },
    [clearPreview],
  );

  // Placing mode
  const enterPlacingMode = useCallback(() => {
    setPlacingMode(true);
    const ctx = sceneCtxRef.current;
    if (ctx) {
      ctx.camera.inputs.removeByType('ArcRotateCameraPointersInput');
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
  }, []);

  const exitPlacingMode = useCallback(() => {
    setPlacingMode(false);
    const ctx = sceneCtxRef.current;
    if (ctx && canvasRef.current) {
      ctx.camera.inputs.addPointers();
      ctx.camera.attachControl(canvasRef.current, true);
      canvasRef.current.style.cursor = 'default';
    }
  }, []);

  const computeIdealRadius = useCallback(() => {
    const canvas = canvasRef.current;
    const ms = modelSizeRef.current;
    const camera = sceneCtxRef.current?.camera;
    if (!canvas || !ms || !camera) return modelDiagonalRef.current * 1.6;
    const fov = camera.fov;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const radiusForHeight = (ms.z / 2) / (Math.tan(fov / 2) * 0.75);
    const radiusForWidth = (ms.x / 2) / (Math.tan(fov / 2) * aspect * 0.75);
    return Math.max(radiusForHeight, radiusForWidth);
  }, []);

  // Initialize scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const ctx = createScene(canvas);
    sceneCtxRef.current = ctx;

    async function init() {
      // Load config
      try {
        const config = await getConfig();
        if (disposed) return;
        setLights(config.lights || []);
        lightsRef.current = config.lights || [];
        setLightGroups(config.lightGroups || []);
        setDisplays(config.displays || []);
        displaysRef.current = config.displays || [];
        setShadowWalls(config.shadowWalls || []);
        shadowWallsRef.current = config.shadowWalls || [];
        setTubes(config.tubes || []);
        tubesRef.current = config.tubes || [];

        // Load model from the same source the dashboard uses (HA or device)
        let modelBlob: Blob | null = null;
        const syncSettings = getSetting('sync');
        if (syncSettings.modelSource === 'ha') {
          modelBlob = await fetchModelFromHA(syncSettings.modelName);
          if (!modelBlob) {
            modelBlob = await getModelBlob();
          }
        } else {
          modelBlob = await getModelBlob();
        }
        if (!modelBlob) {
          navigate('/onboarding');
          return;
        }
        const result = await loadModel(ctx.scene, modelBlob);
        if (disposed) return;

        const modelMeshes = result.meshes.filter((m) => m.getTotalVertices?.() > 0);
        createEdgeOutline(ctx.scene, ctx.camera, { meshes: modelMeshes });

        const target = result.center.clone();
        target.y = 0;
        homeTargetRef.current = target.clone();
        ctx.camera.target = target;
        ctx.camera.alpha = Tools.ToRadians(270);
        ctx.camera.beta = Tools.ToRadians(0.5);
        ctx.camera.lowerRadiusLimit = result.diagonal * 0.27;
        ctx.camera.upperRadiusLimit = result.diagonal * 3;

        modelSizeRef.current = { x: result.size.x, z: result.size.z };
        modelDiagonalRef.current = result.diagonal;
        ctx.camera.radius = computeIdealRadius();

        // Build light meshes
        rebuildAllMeshes(ctx.scene, meshMapRef.current, config.lights || []);

        // Build display meshes (editor-only preview — no live HA data, show placeholder)
        rebuildAllDisplayMeshes(ctx.scene, displayMeshMapRef.current, config.displays || []);
        for (const entry of Object.values(displayMeshMapRef.current)) {
          entry.plane.isPickable = true;
          updateDisplayTexture(entry, buildMockupStates(displaysRef.current));
        }

        // Build tube meshes (editor preview — no live data, show mockup values)
        for (const tc of (config.tubes || [])) {
          tubeMeshMapRef.current[tc.id] = createTubeMeshes(ctx.scene, tc, null);
        }
        renderMockupLabels(tubeMeshMapRef.current);
      } catch (e) {
        if (!disposed) console.warn('[Editor] Init error:', e);
      }
    }

    // Pointer move — coordinate readout
    ctx.scene.onPointerMove = (_evt, pick) => {
      if (pick.hit && pick.pickedPoint) {
        const p = pick.pickedPoint;
        setCoordText(`x: ${p.x.toFixed(2)}  z: ${p.y.toFixed(2)}  y: ${p.z.toFixed(2)}`);
        if (placingModeRef.current && canvas) canvas.style.cursor = 'crosshair';
      } else {
        setCoordText('x: \u2014  z: \u2014  y: \u2014');
        if (!placingModeRef.current && canvas) canvas.style.cursor = 'default';
      }
    };

    // Track pointer start position to distinguish clicks from drags
    let pointerDownPos: { x: number; y: number } | null = null;
    const DRAG_THRESHOLD = 6; // pixels — beyond this it's a rotation, not a click

    // Click to place or click light/display mesh to edit
    ctx.scene.onPointerDown = (evt, pick) => {
      pointerDownPos = { x: evt.clientX, y: evt.clientY };

      if (placingModeRef.current) {
        // Re-pick excluding preview meshes so we hit the model surface
        const placePick = ctx.scene.pick(evt.offsetX, evt.offsetY, (m) => !m.metadata?.previewTarget);
        if (!placePick.hit || !placePick.pickedPoint) return;
        posUndoStackRef.current.push({ ...positionRef.current });
        const p = placePick.pickedPoint;

        // Display placing mode: capture normal
        if (displayPanelOpenRef.current) {
          const faceNormal = placePick.getNormal(true, true);
          const n = faceNormal
            ? { x: parseFloat(faceNormal.x.toFixed(4)), y: parseFloat(faceNormal.y.toFixed(4)), z: parseFloat(faceNormal.z.toFixed(4)) }
            : { x: 0, y: 0, z: 1 };
          setDisplayNormal(n);
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          setPosition(newPos);
          positionRef.current = newPos;
        } else if (wallPanelOpenRef.current) {
          // Wall placing mode: exact position, no offset
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat(p.y.toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          setPosition(newPos);
          positionRef.current = newPos;
        } else {
          // Light placing mode: offset Y slightly
          const newPos: LightPosition = {
            x: parseFloat(p.x.toFixed(3)),
            y: parseFloat((p.y + 0.2).toFixed(3)),
            z: parseFloat(p.z.toFixed(3)),
          };
          setPosition(newPos);
          positionRef.current = newPos;
        }

        setPlacingMode(false);
        document.dispatchEvent(new Event('tour:entity-placed'));
        // Re-enable camera
        ctx.camera.inputs.addPointers();
        ctx.camera.attachControl(canvas, true);
        if (canvas) canvas.style.cursor = 'default';
        return;
      }
    };

    ctx.scene.onPointerUp = (evt) => {
      // Only treat as a click if the pointer barely moved
      if (!pointerDownPos) return;
      const dx = evt.clientX - pointerDownPos.x;
      const dy = evt.clientY - pointerDownPos.y;
      pointerDownPos = null;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) return;

      // When editing a light, allow clicking preview meshes to switch gizmo target
      if (panelOpenRef.current) {
        const gizmo = gizmoRef.current;
        if (gizmo) {
          // Multi-pick to find all preview meshes under cursor, prioritize parts/main over hitbox
          const hits = ctx.scene.multiPick(evt.offsetX, evt.offsetY, (m) => !!m.metadata?.previewTarget);
          if (hits && hits.length > 0) {
            // Prefer part/main over hitbox (lights are often inside the hitbox)
            const sorted = hits
              .filter((h) => h.hit && h.pickedMesh)
              .sort((a, b) => {
                const aPri = a.pickedMesh!.metadata.previewTarget === 'hitbox' ? 1 : 0;
                const bPri = b.pickedMesh!.metadata.previewTarget === 'hitbox' ? 1 : 0;
                return aPri - bPri;
              });
            if (sorted.length > 0) {
              const meta = sorted[0].pickedMesh!.metadata;
              gizmo.attachedMesh = sorted[0].pickedMesh as Mesh;
              if (meta.previewTarget === 'main') {
                gizmoTargetRef.current = 'main';
              } else if (meta.previewTarget === 'part') {
                gizmoTargetRef.current = { type: 'part', index: meta.partIndex };
              } else if (meta.previewTarget === 'hitbox') {
                gizmoTargetRef.current = { type: 'hitbox' };
              }
            }
          }
        }
        return;
      }
      // Skip click-to-edit when already editing a display, wall, or tube
      if (displayPanelOpenRef.current || wallPanelOpenRef.current || tubePanelOpenRef.current) return;

      // Pick under pointer
      const pick = ctx.scene.pick(evt.offsetX, evt.offsetY);
      if (!pick?.hit) return;

      // Click on a light bulb mesh to edit it
      if (pick.pickedMesh?.metadata?.entityId) {
        const clickedId = pick.pickedMesh.metadata.entityId;
        const idx = lightsRef.current.findIndex((l) => l.entityId === clickedId);
        if (idx !== -1) {
          handleEditLightRef.current(idx);
        }
      }

      // Click on a display mesh to edit it
      if (pick.pickedMesh?.metadata?.displayId) {
        const clickedId = pick.pickedMesh.metadata.displayId;
        const idx = displaysRef.current.findIndex((d) => d.id === clickedId);
        if (idx !== -1) {
          handleEditDisplayRef.current(idx);
        }
      }

      // Click on a tube mesh to edit it
      if (pick.pickedMesh?.metadata?.tubeId) {
        const clickedId = pick.pickedMesh.metadata.tubeId;
        const idx = tubesRef.current.findIndex((t) => t.id === clickedId);
        if (idx !== -1) {
          handleEditTubeRef.current(idx);
        }
      }
    };

    init();

    return () => {
      disposed = true;
      Object.keys(meshMapRef.current).forEach((id) =>
        removeLightMesh(meshMapRef.current, id),
      );
      Object.keys(displayMeshMapRef.current).forEach((id) =>
        removeDisplayMesh(displayMeshMapRef.current, id),
      );
      disposeAllTubes(tubeMeshMapRef.current);
      clearPreview();
      for (const m of wallEditorMeshesRef.current) m.dispose();
      wallEditorMeshesRef.current = [];
      if (utilLayerRef.current) {
        utilLayerRef.current.dispose();
        utilLayerRef.current = null;
      }
      ctx.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update preview mesh when position changes and panel is open
  useEffect(() => {
    if (!panelOpen) return;
    // If the position change came from a gizmo drag, just sync mesh position (no rebuild)
    if (draggingGizmoRef.current && previewMeshRef.current) {
      previewMeshRef.current.position.set(position.x, position.y, position.z);
      return;
    }
    const info = previewInfoRef.current;
    updatePreviewMesh(position, info.shape, info.size, info.hitbox, info.parts);
  }, [position, panelOpen, updatePreviewMesh]);

  // Update display preview mesh position when position changes (skip during gizmo drag)
  useEffect(() => {
    if (!displayPanelOpen || !displayPreviewIdRef.current) return;
    if (draggingGizmoRef.current) return;
    const entry = displayMeshMapRef.current[displayPreviewIdRef.current];
    if (!entry) return;
    const normal = new Vector3(displayNormal.x, displayNormal.y, displayNormal.z).normalize();
    entry.plane.position.set(
      position.x + normal.x * 0.005,
      position.y + normal.y * 0.005,
      position.z + normal.z * 0.005,
    );
  }, [position, displayPanelOpen, displayNormal]);

  // Wrap setPosition for slider changes: push undo entry on first change after idle
  const sliderIdleRef = useRef(true);
  const sliderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePositionChange = useCallback((newPos: LightPosition) => {
    if (sliderIdleRef.current) {
      // First change after idle — snapshot current position
      posUndoStackRef.current.push({ ...positionRef.current });
      sliderIdleRef.current = false;
    }
    // Reset idle timer — mark idle after 400ms of no changes
    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = setTimeout(() => { sliderIdleRef.current = true; }, 400);
    setPosition(newPos);
  }, []);

  // Show/hide wall editor meshes when switching to/from walls tab
  useEffect(() => {
    if (editorMode === 'walls') {
      rebuildWallEditorMeshes(shadowWalls);
    } else {
      disposeWallEditorMeshes();
    }
  }, [editorMode, shadowWalls, rebuildWallEditorMeshes, disposeWallEditorMeshes]);

  // Keyboard shortcuts: Ctrl+Z undo, Escape close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;

      // Ctrl+Z undo (must check before the modifier guard)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (!panelOpenRef.current && !displayPanelOpenRef.current && !wallPanelOpenRef.current && !tubePanelOpenRef.current) return;
        const stack = posUndoStackRef.current;
        if (stack.length === 0) return;
        e.preventDefault();
        const prev = stack.pop()!;
        setPosition(prev);
        positionRef.current = prev;
        return;
      }

      // Skip single-key shortcuts when a modifier key is held (allow native Ctrl+C, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'c') {
        navigate('/');
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        const ctx = sceneCtxRef.current;
        const homeTarget = homeTargetRef.current;
        if (!ctx || !homeTarget || homingRef.current) return;
        const { camera, scene } = ctx;
        homingRef.current = true;
        camera.detachControl();

        const fps = 60;
        const frames = 45;
        const ease = new CubicEase();
        ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

        const makeAnim = (prop: string, from: number, to: number) => {
          const a = new Animation(`home_${prop}`, prop, fps, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
          a.setKeys([{ frame: 0, value: from }, { frame: frames, value: to }]);
          a.setEasingFunction(ease);
          return a;
        };

        const targetRadius = computeIdealRadius();
        const targetAlpha = Tools.ToRadians(270);
        const targetBeta = Tools.ToRadians(0.5);
        const targetPos = homeTarget.clone();

        // Skip if already at home — avoids detach/reattach glitch
        const EPS = 0.002;
        if (
          Math.abs(camera.radius - targetRadius) < EPS &&
          Math.abs(camera.alpha - targetAlpha) < EPS &&
          Math.abs(camera.beta - targetBeta) < EPS &&
          Vector3.Distance(camera.target, targetPos) < EPS
        ) {
          homingRef.current = false;
          camera.attachControl(true);
          return;
        }

        const targetAnim = new Animation('home_target', 'target', fps, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
        targetAnim.setKeys([{ frame: 0, value: camera.target.clone() }, { frame: frames, value: targetPos }]);
        targetAnim.setEasingFunction(ease);

        camera.animations = [
          makeAnim('radius', camera.radius, targetRadius),
          makeAnim('alpha', camera.alpha, targetAlpha),
          makeAnim('beta', camera.beta, targetBeta),
          targetAnim,
        ];

        scene.beginAnimation(camera, 0, frames, false, 1, () => {
          camera.attachControl(true);
          homingRef.current = false;
        });
        return;
      }
      if (e.key === 'Escape') {
        if (panelOpenRef.current) {
          e.preventDefault();
          handleClosePanelRef.current();
          return;
        }
        if (displayPanelOpenRef.current) {
          e.preventDefault();
          handleCloseDisplayPanelRef.current();
          return;
        }
        if (wallPanelOpenRef.current) {
          e.preventDefault();
          handleCloseWallPanelRef.current();
          return;
        }
        if (tubePanelOpenRef.current) {
          e.preventDefault();
          handleCloseTubePanelRef.current();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle shape/size changes from LightForm
  const handlePreviewChange = useCallback(
    (info: PreviewInfo) => {
      previewInfoRef.current = info;
      // Skip rebuild when the change came from a gizmo drag on a part/hitbox
      if (skipPreviewRebuildRef.current) {
        skipPreviewRebuildRef.current = false;
        return;
      }
      if (panelOpen) {
        updatePreviewMesh(position, info.shape, info.size, info.hitbox, info.parts);
      }
    },
    [panelOpen, position, updatePreviewMesh],
  );

  // Open panel for new light
  const handleAddLight = useCallback(() => {
    setEditIdx(null);
    setPosition({ x: 0, y: 2.5, z: 0 });
    posUndoStackRef.current = [];
    setPanelOpen(true);
  }, []);

  // Edit existing light
  const handleEditLight = useCallback(
    (idx: number) => {
      // Hide any previously visible hitbox
      for (const entry of Object.values(meshMapRef.current)) {
        if (entry.hitboxMesh) entry.hitboxMesh.visibility = 0;
      }
      const cfg = lights[idx];
      // Show hitbox for the light being edited
      const entry = meshMapRef.current[cfg.entityId];
      if (entry?.hitboxMesh) {
        entry.hitboxMesh.visibility = 1;
      }
      setEditIdx(idx);
      setPosition(cfg.position);
      posUndoStackRef.current = [];
      setPanelOpen(true);
    },
    [lights],
  );

  // Ref so Babylon callbacks can call handleEditLight
  const handleEditLightRef = useRef(handleEditLight);
  handleEditLightRef.current = handleEditLight;

  // Delete light (and auto-save to server)
  const handleDeleteLight = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const id = lights[idx].entityId;
      removeLightMesh(meshMapRef.current, id);
      const updated = lights.filter((_, i) => i !== idx);
      setLights(updated);
      rebuildAllMeshes(scene, meshMapRef.current, updated);

      try {
        await updateConfig({ lights: updated });
        showToast('Light deleted & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Light deleted locally (server sync failed)');
      }
    },
    [lights, showToast],
  );

  // Duplicate light
  const handleDuplicateLight = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = lights[idx];
      const copy: LightConfig = {
        ...src,
        entityId: src.entityId + '_copy',
        label: (src.label || src.entityId) + ' (copy)',
        position: {
          x: src.position.x + 0.3,
          y: src.position.y,
          z: src.position.z,
        },
      };
      const updated = [...lights, copy];
      setLights(updated);
      rebuildAllMeshes(scene, meshMapRef.current, updated);

      try {
        await updateConfig({ lights: updated });
        showToast('Light duplicated & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Light duplicated locally (server sync failed)');
      }
    },
    [lights, showToast],
  );

  // Reorder light in list
  const handleReorderLight = useCallback(
    async (fromIdx: number, toIdx: number) => {
      const updated = arrayMove(lights, fromIdx, toIdx);
      setLights(updated);
      // Adjust editIdx to follow the selected light
      if (editIdx !== null) {
        if (editIdx === fromIdx) {
          setEditIdx(toIdx);
        } else if (fromIdx < editIdx && toIdx >= editIdx) {
          setEditIdx(editIdx - 1);
        } else if (fromIdx > editIdx && toIdx <= editIdx) {
          setEditIdx(editIdx + 1);
        }
      }
      try {
        await updateConfig({ lights: updated });
      } catch (e) {
        console.error('[Config] Reorder save failed:', e);
      }
    },
    [lights, editIdx],
  );

  // Move light to a group
  const handleMoveToGroup = useCallback(
    async (lightIdx: number, groupId: string | undefined) => {
      const updated = lights.map((l, i) =>
        i === lightIdx ? { ...l, group: groupId } : l,
      );
      setLights(updated);
      try {
        await updateConfig({ lights: updated });
      } catch (e) {
        console.error('[Config] Move-to-group save failed:', e);
      }
    },
    [lights],
  );

  // Group CRUD
  const handleAddGroup = useCallback(
    async (name: string) => {
      const newGroup: LightGroup = { id: generateUUID(), name };
      const updated = [...lightGroups, newGroup];
      setLightGroups(updated);
      try {
        await updateConfig({ lightGroups: updated });
      } catch (e) {
        console.error('[Config] Add group save failed:', e);
      }
    },
    [lightGroups],
  );

  const handleRenameGroup = useCallback(
    async (groupId: string, name: string) => {
      const updated = lightGroups.map((g) =>
        g.id === groupId ? { ...g, name } : g,
      );
      setLightGroups(updated);
      try {
        await updateConfig({ lightGroups: updated });
      } catch (e) {
        console.error('[Config] Rename group save failed:', e);
      }
    },
    [lightGroups],
  );

  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      const updatedGroups = lightGroups.filter((g) => g.id !== groupId);
      const updatedLights = lights.map((l) =>
        l.group === groupId ? { ...l, group: undefined } : l,
      );
      setLightGroups(updatedGroups);
      setLights(updatedLights);
      try {
        await updateConfig({ lights: updatedLights, lightGroups: updatedGroups });
      } catch (e) {
        console.error('[Config] Delete group save failed:', e);
      }
    },
    [lights, lightGroups],
  );

  // Close panel
  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setEditIdx(null);
  }, [clearPreview, exitPlacingMode]);
  const handleClosePanelRef = useRef(handleClosePanel);
  handleClosePanelRef.current = handleClosePanel;

  // Save light (and auto-save config to server)
  const handleSaveLight = useCallback(
    async (cfg: LightConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      let updated: LightConfig[];
      if (editIdx !== null) {
        const oldId = lights[editIdx].entityId;
        if (oldId !== cfg.entityId) removeLightMesh(meshMapRef.current, oldId);
        updated = lights.map((l, i) => (i === editIdx ? cfg : l));
      } else {
        updated = [...lights, cfg];
      }

      setLights(updated);
      clearPreview();
      rebuildAllMeshes(scene, meshMapRef.current, updated);
      setPanelOpen(false);
      exitPlacingMode();
      setEditIdx(null);
      document.dispatchEvent(new Event('tour:entity-saved'));

      // Auto-save to server
      try {
        await updateConfig({ lights: updated });
        showToast('Light saved & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Light saved locally (server sync failed)');
      }
    },
    [lights, editIdx, clearPreview, exitPlacingMode, showToast],
  );

  // --- Display handlers ---

  const handleAddDisplay = useCallback(() => {
    setDisplayEditIdx(null);
    setPosition({ x: 0, y: 1.5, z: 0 });
    setDisplayNormal({ x: 0, y: 0, z: 1 });
    posUndoStackRef.current = [];
    setDisplayPanelOpen(true);
  }, []);

  const handleEditDisplay = useCallback(
    (idx: number) => {
      const cfg = displays[idx];
      setDisplayEditIdx(idx);
      setPosition(cfg.position);
      setDisplayNormal(cfg.normal);
      posUndoStackRef.current = [];
      setDisplayPanelOpen(true);
      // Show purple outline around the display being edited
      const entry = displayMeshMapRef.current[cfg.id];
      if (entry) showDisplayOutline(entry.plane);
    },
    [displays, showDisplayOutline],
  );

  const handleEditDisplayRef = useRef(handleEditDisplay);
  handleEditDisplayRef.current = handleEditDisplay;

  const handleDeleteDisplay = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const id = displays[idx].id;
      removeDisplayMesh(displayMeshMapRef.current, id);
      const updated = displays.filter((_, i) => i !== idx);
      setDisplays(updated);

      try {
        await updateConfig({ displays: updated });
        showToast('Display deleted & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Display deleted locally (server sync failed)');
      }
    },
    [displays, showToast],
  );

  const handleDuplicateDisplay = useCallback(
    async (idx: number) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;
      const src = displays[idx];
      const copy: DisplayConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || src.id) + ' (copy)',
        position: { ...src.position, x: src.position.x + 0.3 },
        sources: src.sources.map((s) => ({ ...s })),
      };
      const updated = [...displays, copy];
      setDisplays(updated);
      rebuildAllDisplayMeshes(scene, displayMeshMapRef.current, updated);
      for (const entry of Object.values(displayMeshMapRef.current)) {
        entry.plane.isPickable = true;
        updateDisplayTexture(entry, {});
      }

      try {
        await updateConfig({ displays: updated });
        showToast('Display duplicated & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Display duplicated locally (server sync failed)');
      }
    },
    [displays, showToast],
  );

  const handleCloseDisplayPanel = useCallback(() => {
    // Remove preview display mesh
    if (displayPreviewIdRef.current) {
      removeDisplayMesh(displayMeshMapRef.current, displayPreviewIdRef.current);
      displayPreviewIdRef.current = null;
    }
    // Restore original display mesh if we were editing (not adding new)
    const scene = sceneCtxRef.current?.scene;
    if (scene && displayEditIdx !== null) {
      const cfg = displaysRef.current[displayEditIdx];
      if (cfg) {
        const entry = createDisplayMesh(scene, cfg);
        entry.plane.isPickable = true;
        displayMeshMapRef.current[cfg.id] = entry;
        updateDisplayTexture(entry, buildMockupStates(displaysRef.current));
      }
    }
    clearDisplayOutline();
    setDisplayPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setDisplayEditIdx(null);
  }, [clearPreview, clearDisplayOutline, exitPlacingMode, displayEditIdx]);
  const handleCloseDisplayPanelRef = useRef(handleCloseDisplayPanel);
  handleCloseDisplayPanelRef.current = handleCloseDisplayPanel;

  // Live preview: rebuild display mesh on every form change
  const handleDisplayPreviewChange = useCallback(
    (info: DisplayPreviewInfo) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      // Determine which display ID we're previewing
      const editIdx = displayEditIdx;
      const editingCfg = displaysRef.current[editIdx ?? -1];
      const previewId = editingCfg?.id || '__preview__';

      // Remove old preview mesh (or the original display being edited on first call)
      const oldPreviewId = displayPreviewIdRef.current;
      if (oldPreviewId) {
        removeDisplayMesh(displayMeshMapRef.current, oldPreviewId);
      } else if (previewId !== '__preview__') {
        // First preview change while editing — dispose the original display mesh
        removeDisplayMesh(displayMeshMapRef.current, previewId);
      }
      displayPreviewIdRef.current = previewId;

      // Build a temporary DisplayConfig from form state
      const tempCfg: DisplayConfig = {
        id: previewId,
        label: '',
        sources: info.sources,
        position: positionRef.current,
        normal: displayNormalRef.current,
        width: 0,
        height: 0,
        textAlign: info.textAlign,
        opacity: info.opacity,
        backgroundColor: info.backgroundColor,
        mirrorH: info.mirrorH,
        mirrorV: info.mirrorV,
      };

      const entry = createDisplayMesh(scene, tempCfg);
      entry.plane.isPickable = false;
      displayMeshMapRef.current[previewId] = entry;
      updateDisplayTexture(entry, buildMockupStates([tempCfg]));

      // Show purple outline around the preview display
      showDisplayOutline(entry.plane);

      // Attach position gizmo to display plane
      if (gizmoRef.current) {
        gizmoRef.current.dispose();
        gizmoRef.current = null;
      }
      if (!utilLayerRef.current) {
        utilLayerRef.current = new UtilityLayerRenderer(scene);
      }
      const gizmo = new PositionGizmo(utilLayerRef.current);
      gizmo.scaleRatio = 1.2;
      gizmo.updateGizmoRotationToMatchAttachedMesh = false;
      gizmo.attachedMesh = entry.plane;

      const onDragStart = () => {
        draggingGizmoRef.current = true;
        posUndoStackRef.current.push({ ...positionRef.current });
      };
      const onDrag = () => {
        const p = entry.plane.position;
        const n = displayNormalRef.current;
        const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
        const newPos: LightPosition = {
          x: parseFloat((p.x - (n.x / len) * 0.005).toFixed(3)),
          y: parseFloat((p.y - (n.y / len) * 0.005).toFixed(3)),
          z: parseFloat((p.z - (n.z / len) * 0.005).toFixed(3)),
        };
        positionRef.current = newPos;
        setPosition(newPos);
      };
      const onDragEnd = () => { draggingGizmoRef.current = false; document.dispatchEvent(new Event('tour:gizmo-used')); };
      for (const ax of [gizmo.xGizmo, gizmo.yGizmo, gizmo.zGizmo]) {
        ax.dragBehavior.onDragStartObservable.add(onDragStart);
        ax.dragBehavior.onDragObservable.add(onDrag);
        ax.dragBehavior.onDragEndObservable.add(onDragEnd);
      }
      for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
        if (m.material) {
          (m.material as StandardMaterial).alpha = 0.5;
        }
      }
      gizmoRef.current = gizmo;
    },
    [displayEditIdx, showDisplayOutline],
  );

  const handleSaveDisplay = useCallback(
    async (cfg: DisplayConfig) => {
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      // Clean up preview mesh
      if (displayPreviewIdRef.current) {
        removeDisplayMesh(displayMeshMapRef.current, displayPreviewIdRef.current);
        displayPreviewIdRef.current = null;
      }

      let updated: DisplayConfig[];
      if (displayEditIdx !== null) {
        const oldId = displays[displayEditIdx].id;
        if (oldId !== cfg.id) removeDisplayMesh(displayMeshMapRef.current, oldId);
        updated = displays.map((d, i) => (i === displayEditIdx ? cfg : d));
      } else {
        updated = [...displays, cfg];
      }

      setDisplays(updated);
      clearPreview();
      rebuildAllDisplayMeshes(scene, displayMeshMapRef.current, updated);
      for (const entry of Object.values(displayMeshMapRef.current)) {
        entry.plane.isPickable = true;
        updateDisplayTexture(entry, buildMockupStates(updated));
      }
      setDisplayPanelOpen(false);
      exitPlacingMode();
      setDisplayEditIdx(null);

      try {
        await updateConfig({ displays: updated });
        showToast('Display saved & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Display saved locally (server sync failed)');
      }
    },
    [displays, displayEditIdx, clearPreview, exitPlacingMode, showToast],
  );

  // --- Shadow wall handlers ---

  const handleAddWall = useCallback(() => {
    setWallEditIdx(null);
    setPosition({ x: 0, y: 2.6, z: 0 });
    posUndoStackRef.current = [];
    setWallPanelOpen(true);
  }, []);

  const handleEditWall = useCallback(
    (idx: number) => {
      const cfg = shadowWalls[idx];
      setWallEditIdx(idx);
      setPosition(cfg.position);
      posUndoStackRef.current = [];
      setWallPanelOpen(true);
    },
    [shadowWalls],
  );

  const handleDeleteWall = useCallback(
    async (idx: number) => {
      const updated = shadowWalls.filter((_, i) => i !== idx);
      setShadowWalls(updated);
      try {
        await updateConfig({ shadowWalls: updated });
        showToast('Wall deleted & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Wall deleted locally (server sync failed)');
      }
    },
    [shadowWalls, showToast],
  );

  const handleDuplicateWall = useCallback(
    async (idx: number) => {
      const src = shadowWalls[idx];
      const copy: ShadowWallConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || 'Wall') + ' (copy)',
        position: { ...src.position, x: src.position.x + 0.5 },
        size: { ...src.size },
      };
      const updated = [...shadowWalls, copy];
      setShadowWalls(updated);
      try {
        await updateConfig({ shadowWalls: updated });
        showToast('Wall duplicated & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Wall duplicated locally (server sync failed)');
      }
    },
    [shadowWalls, showToast],
  );

  const handleCloseWallPanel = useCallback(() => {
    setWallPanelOpen(false);
    clearPreview();
    exitPlacingMode();
    setWallEditIdx(null);
  }, [clearPreview, exitPlacingMode]);
  const handleCloseWallPanelRef = useRef(handleCloseWallPanel);
  handleCloseWallPanelRef.current = handleCloseWallPanel;

  const handleWallPreviewChange = useCallback(
    (info: WallPreviewInfo) => {
      wallPreviewInfoRef.current = info;
      if (wallPanelOpen) {
        // Rebuild the wall preview mesh (reuse updatePreviewMesh with cube shape)
        updatePreviewMesh(
          position,
          'cube',
          { width: info.size.width, height: info.size.height, depth: info.size.depth },
        );
      }
    },
    [wallPanelOpen, position, updatePreviewMesh],
  );

  const handleSaveWall = useCallback(
    async (cfg: ShadowWallConfig) => {
      let updated: ShadowWallConfig[];
      if (wallEditIdx !== null) {
        updated = shadowWalls.map((w, i) => (i === wallEditIdx ? cfg : w));
      } else {
        updated = [...shadowWalls, cfg];
      }
      setShadowWalls(updated);
      clearPreview();
      exitPlacingMode();
      setWallPanelOpen(false);
      setWallEditIdx(null);

      try {
        await updateConfig({ shadowWalls: updated });
        showToast('Wall saved & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Wall saved locally (server sync failed)');
      }
    },
    [shadowWalls, wallEditIdx, clearPreview, exitPlacingMode, showToast],
  );

  // Update wall preview mesh when position changes and wall panel is open
  useEffect(() => {
    if (!wallPanelOpen) return;
    if (draggingGizmoRef.current && previewMeshRef.current) {
      previewMeshRef.current.position.set(position.x, position.y, position.z);
      return;
    }
    const info = wallPreviewInfoRef.current;
    updatePreviewMesh(
      position,
      'cube',
      { width: info.size.width, height: info.size.height, depth: info.size.depth },
    );
  }, [position, wallPanelOpen, updatePreviewMesh]);

  // ── Tube handlers ──────────────────────────────────────────────

  const handleAddTube = useCallback(() => {
    setTubeEditIdx(null);
    setPosition({ x: 0, y: 0, z: 0 });
    posUndoStackRef.current = [];
    setTubePanelOpen(true);
  }, []);

  const handleEditTube = useCallback(
    (idx: number) => {
      const cfg = tubes[idx];
      setTubeEditIdx(idx);
      setPosition({ x: cfg.endX, y: 0, z: cfg.endZ });
      posUndoStackRef.current = [];
      setTubePanelOpen(true);
    },
    [tubes],
  );

  const handleEditTubeRef = useRef(handleEditTube);
  handleEditTubeRef.current = handleEditTube;

  const handleDeleteTube = useCallback(
    async (idx: number) => {
      const deleted = tubes[idx];
      if (deleted) removeTubeMeshes(tubeMeshMapRef.current, deleted.id);
      const updated = tubes.filter((_, i) => i !== idx);
      setTubes(updated);
      try {
        await updateConfig({ tubes: updated });
        showToast('Tube deleted & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Tube deleted locally (server sync failed)');
      }
    },
    [tubes, showToast],
  );

  const handleDuplicateTube = useCallback(
    async (idx: number) => {
      const src = tubes[idx];
      const copy: TubeConfig = {
        ...src,
        id: generateUUID(),
        label: (src.label || 'Tube') + ' (copy)',
        endX: src.endX + 0.5,
        lines: src.lines.map(l => ({ ...l })),
      };
      const updated = [...tubes, copy];
      setTubes(updated);
      // Create mesh for the copy
      const scene = sceneCtxRef.current?.scene;
      if (scene) {
        tubeMeshMapRef.current[copy.id] = createTubeMeshes(scene, copy, null);
      }
      try {
        await updateConfig({ tubes: updated });
        showToast('Tube duplicated & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Tube duplicated locally (server sync failed)');
      }
    },
    [tubes, showToast],
  );

  const handleCloseTubePanel = useCallback(() => {
    setTubePanelOpen(false);
    clearPreview();
    setTubeEditIdx(null);
    // Show tube meshes that were hidden during editing
    rebuildTubeEditorMeshes(tubesRef.current);
  }, [clearPreview]);
  const handleCloseTubePanelRef = useRef(handleCloseTubePanel);
  handleCloseTubePanelRef.current = handleCloseTubePanel;

  const rebuildTubeEditorMeshes = useCallback((tubeConfigs: TubeConfig[]) => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    disposeAllTubes(tubeMeshMapRef.current);
    for (const tc of tubeConfigs) {
      tubeMeshMapRef.current[tc.id] = createTubeMeshes(scene, tc, null);
    }
    renderMockupLabels(tubeMeshMapRef.current);
  }, []);

  const handleTubePreviewChange = useCallback(
    (info: TubePreviewInfo) => {
      tubePreviewInfoRef.current = info;
      if (!tubePanelOpen) return;
      const scene = sceneCtxRef.current?.scene;
      if (!scene) return;

      // Remove old preview tube
      removeTubeMeshes(tubeMeshMapRef.current, '__tube_preview__');

      // Create a temporary preview tube mesh
      const previewCfg: TubeConfig = { ...info.config, id: '__tube_preview__' };
      tubeMeshMapRef.current['__tube_preview__'] = createTubeMeshes(scene, previewCfg, null);
      renderMockupLabels(tubeMeshMapRef.current);
    },
    [tubePanelOpen],
  );

  const handleSaveTube = useCallback(
    async (cfg: TubeConfig) => {
      let updated: TubeConfig[];
      if (tubeEditIdx !== null) {
        // Remove old mesh
        const oldId = tubes[tubeEditIdx]?.id;
        if (oldId) removeTubeMeshes(tubeMeshMapRef.current, oldId);
        updated = tubes.map((t, i) => (i === tubeEditIdx ? cfg : t));
      } else {
        updated = [...tubes, cfg];
      }
      setTubes(updated);
      clearPreview();
      setTubePanelOpen(false);
      setTubeEditIdx(null);

      // Remove preview tube and rebuild all
      removeTubeMeshes(tubeMeshMapRef.current, '__tube_preview__');
      const scene = sceneCtxRef.current?.scene;
      if (scene) {
        disposeAllTubes(tubeMeshMapRef.current);
        for (const tc of updated) {
          tubeMeshMapRef.current[tc.id] = createTubeMeshes(scene, tc, null);
        }
      }

      try {
        await updateConfig({ tubes: updated });
        showToast('Tube saved & synced to server');
      } catch (e) {
        console.error('[Config] Auto-save failed:', e);
        showToast('Tube saved locally (server sync failed)');
      }
    },
    [tubes, tubeEditIdx, clearPreview, showToast],
  );

  // Hide the tube being edited (show only the preview), keep others visible
  useEffect(() => {
    if (tubePanelOpen && tubeEditIdx !== null) {
      const editedId = tubes[tubeEditIdx]?.id;
      if (editedId) {
        const entry = tubeMeshMapRef.current[editedId];
        if (entry) {
          for (const m of entry.tubes) m.setEnabled(false);
          for (const l of entry.labels) l.plane.setEnabled(false);
          for (const pe of entry.particles) {
            for (const s of pe.spheres) s.setEnabled(false);
          }
        }
      }
    }
  }, [tubePanelOpen, tubeEditIdx, tubes]);

  // Attach a position gizmo to the tube endpoint when editing
  useEffect(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!tubePanelOpen || !scene) return;

    // Create a small anchor sphere at the endpoint
    const anchor = MeshBuilder.CreateSphere('tube-endpoint-anchor', { diameter: 0.15 }, scene);
    anchor.position = new Vector3(positionRef.current.x, 0, positionRef.current.z);
    anchor.isPickable = false;
    const mat = new StandardMaterial('tube-anchor-mat', scene);
    mat.emissiveColor = new Color3(0.2, 0.7, 1.0);
    mat.alpha = 0.7;
    mat.disableLighting = true;
    anchor.material = mat;
    tubeAnchorRef.current = anchor;

    // Attach gizmo
    if (!utilLayerRef.current) {
      utilLayerRef.current = new UtilityLayerRenderer(scene);
    }
    if (gizmoRef.current) {
      gizmoRef.current.dispose();
      gizmoRef.current = null;
    }
    const gizmo = new PositionGizmo(utilLayerRef.current);
    gizmo.scaleRatio = 1.2;
    gizmo.attachedMesh = anchor;
    // Disable Y axis — tubes only move in X/Z
    gizmo.yGizmo.dispose();

    const onDragStart = () => {
      draggingGizmoRef.current = true;
      posUndoStackRef.current.push({ ...positionRef.current });
    };
    const onDrag = () => {
      const p = anchor.position;
      const newPos: LightPosition = {
        x: parseFloat(p.x.toFixed(3)),
        y: 0,
        z: parseFloat(p.z.toFixed(3)),
      };
      positionRef.current = newPos;
      setPosition(newPos);
    };
    const onDragEnd = () => {
      draggingGizmoRef.current = false;
      document.dispatchEvent(new Event('tour:gizmo-used'));
      // Force tube preview rebuild at final position
      setPosition({ ...positionRef.current });
    };
    for (const ax of [gizmo.xGizmo, gizmo.zGizmo]) {
      ax.dragBehavior.onDragStartObservable.add(onDragStart);
      ax.dragBehavior.onDragObservable.add(onDrag);
      ax.dragBehavior.onDragEndObservable.add(onDragEnd);
    }
    // Semi-transparent arrows
    for (const m of utilLayerRef.current!.utilityLayerScene.meshes) {
      if (m.material) {
        (m.material as StandardMaterial).alpha = 0.5;
      }
    }
    gizmoRef.current = gizmo;

    return () => {
      gizmo.dispose();
      if (gizmoRef.current === gizmo) gizmoRef.current = null;
      anchor.material?.dispose();
      anchor.dispose();
      tubeAnchorRef.current = null;
    };
  }, [tubePanelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync tube anchor position during gizmo drag (skip tube rebuild)
  useEffect(() => {
    if (!tubePanelOpen) return;
    if (draggingGizmoRef.current && tubeAnchorRef.current) {
      tubeAnchorRef.current.position.set(position.x, 0, position.z);
      return;
    }
    // Position changed from sliders/placing — sync anchor
    if (tubeAnchorRef.current) {
      tubeAnchorRef.current.position.set(position.x, 0, position.z);
    }
  }, [position, tubePanelOpen]);

  // Show/hide tube editor meshes when switching to/from tubes tab
  useEffect(() => {
    if (editorMode === 'tubes' && !tubePanelOpen) {
      rebuildTubeEditorMeshes(tubes);
    } else if (editorMode !== 'tubes') {
      disposeAllTubes(tubeMeshMapRef.current);
    }
  }, [editorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update tube preview when endpoint position changes (skip during gizmo drag)
  useEffect(() => {
    if (!tubePanelOpen) return;
    if (draggingGizmoRef.current) return; // anchor moves via gizmo, rebuild on drag end
    const info = tubePreviewInfoRef.current;
    if (!info) return;

    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;

    // Rebuild preview tube at new position
    removeTubeMeshes(tubeMeshMapRef.current, '__tube_preview__');
    const previewCfg: TubeConfig = {
      ...info.config,
      id: '__tube_preview__',
      endX: position.x,
      endZ: position.z,
    };
    tubeMeshMapRef.current['__tube_preview__'] = createTubeMeshes(scene, previewCfg, null);
    renderMockupLabels(tubeMeshMapRef.current);
  }, [position, tubePanelOpen]);

  // Save config to server
  const handleSaveConfig = useCallback(async () => {
    try {
      await updateConfig({ lights, lightGroups, displays, shadowWalls, tubes });
      showToast(`Saved ${lights.length} lights + ${displays.length} displays + ${shadowWalls.length} walls + ${tubes.length} tubes to server`);
    } catch (e) {
      alert('Failed to save config: ' + (e instanceof Error ? e.message : e));
    }
  }, [lights, displays, shadowWalls, tubes, showToast]);

  // Load config from server
  const handleLoadConfig = useCallback(async () => {
    try {
      const config = await getConfig();
      setLights(config.lights || []);
      setLightGroups(config.lightGroups || []);
      setDisplays(config.displays || []);
      setShadowWalls(config.shadowWalls || []);
      setTubes(config.tubes || []);
      tubesRef.current = config.tubes || [];
      const scene = sceneCtxRef.current?.scene;
      if (scene) {
        rebuildAllMeshes(scene, meshMapRef.current, config.lights || []);
        rebuildAllDisplayMeshes(scene, displayMeshMapRef.current, config.displays || []);
        for (const entry of Object.values(displayMeshMapRef.current)) {
          entry.plane.isPickable = true;
          updateDisplayTexture(entry, buildMockupStates(displaysRef.current));
        }
        disposeAllTubes(tubeMeshMapRef.current);
        for (const tc of (config.tubes || [])) {
          tubeMeshMapRef.current[tc.id] = createTubeMeshes(scene, tc, null);
        }
        renderMockupLabels(tubeMeshMapRef.current);
      }
      showToast(`Loaded ${config.lights?.length || 0} lights + ${config.displays?.length || 0} displays + ${config.shadowWalls?.length || 0} walls + ${config.tubes?.length || 0} tubes`);
    } catch (e) {
      alert('Failed to load config: ' + (e instanceof Error ? e.message : e));
    }
  }, [showToast]);

  return (
    <div className="config-editor">
      {/* Sidebar */}
      <div className="editor-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">&#9881; Editor</span>
          <div className="sidebar-header-actions">
            <Link to="/" className="back-btn">
              &larr; Dashboard
            </Link>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="editor-tabs">
          <button
            className={`editor-tab${editorMode === 'lights' ? ' active' : ''}`}
            onClick={() => setEditorMode('lights')}
          >
            Lights ({lights.length})
          </button>
          <button
            className={`editor-tab${editorMode === 'displays' ? ' active' : ''}`}
            data-tab="displays"
            onClick={() => setEditorMode('displays')}
          >
            Displays ({displays.length})
          </button>
          <button
            className={`editor-tab${editorMode === 'walls' ? ' active' : ''}`}
            data-tab="walls"
            onClick={() => setEditorMode('walls')}
          >
            Walls ({shadowWalls.length})
          </button>
          <button
            className={`editor-tab${editorMode === 'tubes' ? ' active' : ''}`}
            data-tab="tubes"
            onClick={() => setEditorMode('tubes')}
          >
            Tubes ({tubes.length})
          </button>
        </div>

        <div className="light-list">
          {editorMode === 'lights' ? (
            <LightList
              lights={lights}
              lightGroups={lightGroups}
              selectedIdx={editIdx}
              onSelect={handleEditLight}
              onDelete={handleDeleteLight}
              onDuplicate={handleDuplicateLight}
              onReorder={handleReorderLight}
              onMoveToGroup={handleMoveToGroup}
              onAddGroup={handleAddGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
            />
          ) : editorMode === 'displays' ? (
            <DisplayList
              displays={displays}
              selectedIdx={displayEditIdx}
              onSelect={handleEditDisplay}
              onDelete={handleDeleteDisplay}
              onDuplicate={handleDuplicateDisplay}
            />
          ) : editorMode === 'walls' ? (
            <ShadowWallList
              walls={shadowWalls}
              selectedIdx={wallEditIdx}
              onSelect={handleEditWall}
              onDelete={handleDeleteWall}
              onDuplicate={handleDuplicateWall}
            />
          ) : (
            <TubeList
              tubes={tubes}
              selectedIdx={tubeEditIdx}
              onSelect={handleEditTube}
              onDelete={handleDeleteTube}
              onDuplicate={handleDuplicateTube}
            />
          )}
        </div>

        <div className="sidebar-footer">
          {editorMode === 'lights' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddLight}>
              + Add Light
            </button>
          ) : editorMode === 'displays' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddDisplay}>
              + Add Display
            </button>
          ) : editorMode === 'walls' ? (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddWall}>
              + Add Wall
            </button>
          ) : (
            <button className="btn btn-primary editor-add-btn" onClick={handleAddTube}>
              + Add Tube
            </button>
          )}
          <button className="btn btn-ghost" onClick={handleLoadConfig}>
            &uarr; Reload from server
          </button>
          <button className="btn btn-success" onClick={handleSaveConfig}>
            &darr; Save to server
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="canvas-area editor-canvas">
        <canvas ref={canvasRef} />
        <div className={`mode-banner${placingMode ? ' visible' : ''}`}>
          {displayPanelOpen ? 'Click on a wall surface to place display' : wallPanelOpen ? 'Click on the model to place wall' : 'Click on the model to place light'}
        </div>
        <div className="coord-readout">{coordText}</div>
        <div className={`toast${toastVisible ? ' show' : ''}`}>{toastMsg}</div>

        <LightForm
          ref={lightFormRef}
          open={panelOpen}
          editLight={editIdx !== null ? lights[editIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveLight}
          onClose={handleClosePanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handlePreviewChange}
          placingMode={placingMode}
          haEntities={haEntities}
        />

        <DisplayForm
          open={displayPanelOpen}
          editDisplay={displayEditIdx !== null ? displays[displayEditIdx] : null}
          position={position}
          normal={displayNormal}
          onPositionChange={handlePositionChange}
          onSave={handleSaveDisplay}
          onClose={handleCloseDisplayPanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleDisplayPreviewChange}
          placingMode={placingMode}
          haEntities={haEntities}
        />

        <ShadowWallForm
          open={wallPanelOpen}
          editWall={wallEditIdx !== null ? shadowWalls[wallEditIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveWall}
          onClose={handleCloseWallPanel}
          onEnterPlacingMode={enterPlacingMode}
          onExitPlacingMode={exitPlacingMode}
          onPreviewChange={handleWallPreviewChange}
          placingMode={placingMode}
        />

        <TubeForm
          open={tubePanelOpen}
          editTube={tubeEditIdx !== null ? tubes[tubeEditIdx] : null}
          position={position}
          onPositionChange={handlePositionChange}
          onSave={handleSaveTube}
          onClose={handleCloseTubePanel}
          onPreviewChange={handleTubePreviewChange}
          haEntities={haEntities}
        />
      </div>

      {showGuidedTour && (
        <GuidedTour
          steps={editorTourSteps}
          onComplete={() => {
            setShowGuidedTour(false);
            // Clean the URL param
            navigate('/editor', { replace: true });
          }}
        />
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { radiusAt, type BeamSegment } from "@shared/laserPhysics";
import labModelUrl from "../../assets/ltor_lab.glb";
import { PARTS, type LabPart } from "./knowledge";

/** Geometry conventions shared with assets/blender/build_ltor_lab.py. */
export const BENCH = {
  beamHeight: 0.075,
  apertureX: -0.25,
  /** Absorber surface of the power meter, measured from the aperture [m]. */
  end: 0.65,
  shutterZ: 0.012,
  lensMin: 0.04,
  lensMax: 0.6,
  planeMin: 0.005,
  planeMax: 0.645,
};

/** Visual exaggeration of the beam radius (shown in the legend). */
export const BEAM_EXAGGERATION = 8;
const MIN_VISUAL_RADIUS = 0.0004;

export interface LabSceneProps {
  /** Beam segments in bench coordinates (z = 0 at the aperture). */
  segments: BeamSegment[];
  /** Beam colour (CSS), already false-coloured for IR. */
  beamColor: string;
  /** Power leaving the aperture [mW] (0 = no beam). */
  powerMw: number;
  shutterOpen: boolean;
  /** LED: "off" | "blink" | "on". */
  led: "off" | "blink" | "on";
  lensInPath: boolean;
  lensZ: number;
  planeZ: number;
  onSelect: (part: LabPart) => void;
  onLensMove: (z: number) => void;
  onPlaneMove: (z: number) => void;
  onDragEnd: (what: "lens" | "plane") => void;
}

type DragTarget = "lens" | "plane";

function partOf(obj: THREE.Object3D | null): LabPart | null {
  for (let o = obj; o; o = o.parent) {
    const p = o.userData?.["ltor_part"];
    if (typeof p === "string" && p in PARTS) return p as LabPart;
  }
  return null;
}

/** Lathe profile of the beam envelope along the bench (exaggerated radius). */
function beamGeometry(segments: BeamSegment[], zEnd: number, scale: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (const seg of segments) {
    const a = seg.zStart;
    const b = Math.min(seg.zEnd, zEnd);
    if (b <= a) continue;
    const n = 90;
    for (let k = 0; k <= n; k++) {
      // denser sampling around the waist
      let z = a + ((b - a) * k) / n;
      if (seg.zWaist > a && seg.zWaist < b) {
        const t = k / n;
        const mid = (seg.zWaist - a) / (b - a);
        const s = t < mid ? mid * (1 - (1 - t / mid) ** 2) : mid + (1 - mid) * ((t - mid) / (1 - mid)) ** 2;
        z = a + (b - a) * s;
      }
      const r = Math.max(MIN_VISUAL_RADIUS, radiusAt(segments, z) * BEAM_EXAGGERATION * scale);
      pts.push(new THREE.Vector2(r, z));
    }
  }
  if (pts.length < 2) pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(0, 1e-4));
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.rotateZ(-Math.PI / 2); // lathe axis (Y) → optical axis (X)
  return geo;
}

export function LabScene(props: LabSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const api = useRef<{
    setBeam: (p: LabSceneProps) => void;
    setDynamic: (p: LabSceneProps) => void;
  } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; part: LabPart } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef0f2");
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.03, 0);
    // Until the user moves the camera, keep the whole bench in view.
    let userMovedCamera = false;
    controls.addEventListener("start", () => (userMovedCamera = true));
    const viewDir = new THREE.Vector3(0.32, 0.42, 0.86).normalize();
    function fitBench() {
      const halfW = 0.5; // bench is 0.9 m long, plus margin
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = Math.max(halfW / Math.tan(hfov / 2), 0.32 / Math.tan(vfov / 2));
      camera.position.copy(controls.target).addScaledVector(viewDir, dist);
    }
    controls.enableDamping = true;
    controls.minDistance = 0.15;
    controls.maxDistance = 2.0;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.4, 1.2, 0.8);
    scene.add(sun);

    // ---- dynamic objects -------------------------------------------------
    const bench = new THREE.Group();
    bench.position.set(BENCH.apertureX, BENCH.beamHeight, 0);
    scene.add(bench);

    // Normal blending: additive light would wash out to white on the light
    // lab background.
    const beamMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const coreMat = beamMat.clone();
    const beam = new THREE.Mesh(new THREE.BufferGeometry(), beamMat);
    const core = new THREE.Mesh(new THREE.BufferGeometry(), coreMat);
    beam.userData["ltor_part"] = "Beam";
    core.userData["ltor_part"] = "Beam";
    bench.add(beam, core);

    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    spot.rotation.y = Math.PI / 2;
    bench.add(spot);

    // virtual measurement plane with the 1/e² circle
    const plane = new THREE.Group();
    plane.userData["ltor_part"] = "Plane";
    const planeFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.05),
      new THREE.MeshBasicMaterial({
        color: "#2563eb",
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    planeFill.rotation.y = Math.PI / 2;
    const planeFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.05, 0.05)),
      new THREE.LineBasicMaterial({ color: "#2563eb" }),
    );
    planeFrame.rotation.y = Math.PI / 2;
    const circlePts = Array.from({ length: 65 }, (_, k) => {
      const a = (2 * Math.PI * k) / 64;
      return new THREE.Vector3(0, Math.cos(a), Math.sin(a));
    });
    const planeCircle = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(circlePts),
      new THREE.LineBasicMaterial({ color: "#1d4ed8" }),
    );
    // Lines are picked with a 1-unit (= 1 m) tolerance by default and would
    // swallow every click – only the filled square is pickable.
    planeFrame.raycast = () => undefined;
    planeCircle.raycast = () => undefined;
    plane.add(planeFill, planeFrame, planeCircle);
    bench.add(plane);

    // ---- glTF model ------------------------------------------------------
    let lensMount: THREE.Object3D | null = null;
    let shutter: THREE.Object3D | null = null;
    let shutterBaseY = 0;
    let ledMat: THREE.MeshStandardMaterial | null = null;
    let disposed = false;

    void fetch(labModelUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => new GLTFLoader().parseAsync(buf, ""))
      .then((gltf) => {
        if (disposed) return;
        scene.add(gltf.scene);
        lensMount = gltf.scene.getObjectByName("LensMount") ?? null;
        shutter = gltf.scene.getObjectByName("Shutter") ?? null;
        shutterBaseY = shutter?.position.y ?? 0;
        const led = gltf.scene.getObjectByName("EmissionLED") as THREE.Mesh | undefined;
        if (led && led.material instanceof THREE.MeshStandardMaterial) {
          ledMat = led.material.clone();
          led.material = ledMat;
        }
        api.current?.setBeam(propsRef.current);
        api.current?.setDynamic(propsRef.current);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));

    // ---- updates from React ----------------------------------------------
    api.current = {
      setBeam(p) {
        const visible = p.powerMw > 0.0005;
        const zEnd = p.shutterOpen ? BENCH.end : BENCH.shutterZ;
        beam.geometry.dispose();
        core.geometry.dispose();
        beam.geometry = beamGeometry(p.segments, zEnd, 1);
        core.geometry = beamGeometry(p.segments, zEnd, 0.35);
        // brightness ~ log(power): 0.01 mW faint … 1 W bright
        const b = Math.min(1, Math.max(0, (Math.log10(p.powerMw + 1e-6) + 2) / 5));
        beamMat.color.set(p.beamColor);
        coreMat.color.set(p.beamColor).lerp(new THREE.Color("#ffffff"), 0.25);
        beamMat.opacity = 0.18 + 0.4 * b;
        coreMat.opacity = 0.45 + 0.5 * b;
        beam.visible = core.visible = visible;

        spot.visible = visible;
        const spotR = Math.max(MIN_VISUAL_RADIUS, radiusAt(p.segments, zEnd) * BEAM_EXAGGERATION);
        spot.scale.setScalar(spotR * 1.4);
        spot.position.x = zEnd - 0.0006;
        (spot.material as THREE.MeshBasicMaterial).color.set(p.beamColor);
        (spot.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.6 * b;

        const rPlane = radiusAt(p.segments, p.planeZ) * BEAM_EXAGGERATION;
        planeCircle.scale.setScalar(Math.max(MIN_VISUAL_RADIUS, rPlane));
        planeCircle.visible = visible && (p.shutterOpen || p.planeZ < BENCH.shutterZ);
      },
      setDynamic(p) {
        if (lensMount) {
          lensMount.visible = p.lensInPath;
          lensMount.position.x = BENCH.apertureX + p.lensZ;
        }
        plane.position.x = p.planeZ;
      },
    };
    api.current.setBeam(props);
    api.current.setDynamic(props);

    // ---- interaction -----------------------------------------------------
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const benchPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BENCH.beamHeight);
    const hit = new THREE.Vector3();
    let drag: DragTarget | null = null;
    let downAt: { x: number; y: number } | null = null;

    function setPointer(ev: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
    }

    function pick(): { part: LabPart | null; drag: DragTarget | null } {
      const parts = ray
        .intersectObjects(scene.children, true)
        .filter((h) => h.object.visible)
        .map((h) => partOf(h.object))
        .filter((p): p is LabPart => p !== null);
      // The (transparent) beam must not hide the parts behind it: the first
      // solid part along the ray wins, the beam only if nothing else is hit.
      const part = parts.find((p) => p !== "Beam") ?? parts[0] ?? null;
      if (part === "Lens" && propsRef.current.lensInPath) return { part, drag: "lens" };
      if (part === "Plane") return { part, drag: "plane" };
      return { part, drag: null };
    }

    const onDown = (ev: PointerEvent) => {
      setPointer(ev);
      downAt = { x: ev.clientX, y: ev.clientY };
      const p = pick();
      if (p.drag) {
        drag = p.drag;
        controls.enabled = false;
        renderer.domElement.setPointerCapture(ev.pointerId);
      }
    };
    const onMove = (ev: PointerEvent) => {
      setPointer(ev);
      if (drag) {
        if (ray.ray.intersectPlane(benchPlane, hit)) {
          const z = hit.x - BENCH.apertureX;
          if (drag === "lens") {
            propsRef.current.onLensMove(Math.min(BENCH.lensMax, Math.max(BENCH.lensMin, z)));
          } else {
            propsRef.current.onPlaneMove(Math.min(BENCH.planeMax, Math.max(BENCH.planeMin, z)));
          }
        }
        return;
      }
      const p = pick();
      const r = renderer.domElement.getBoundingClientRect();
      renderer.domElement.style.cursor = p.drag ? "ew-resize" : p.part ? "pointer" : "grab";
      setHover(p.part ? { x: ev.clientX - r.left, y: ev.clientY - r.top, part: p.part } : null);
    };
    const onUp = (ev: PointerEvent) => {
      if (drag) {
        propsRef.current.onDragEnd(drag);
        drag = null;
        controls.enabled = true;
        renderer.domElement.releasePointerCapture(ev.pointerId);
      }
      if (downAt && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) < 4) {
        setPointer(ev);
        const p = pick();
        if (p.part) propsRef.current.onSelect(p.part);
      }
      downAt = null;
    };
    const onLeave = () => setHover(null);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    // ---- render loop -----------------------------------------------------
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      if (!userMovedCamera) fitBench();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      const p = propsRef.current;
      if (shutter) {
        const target = shutterBaseY + (p.shutterOpen ? 0.03 : 0);
        shutter.position.y += (target - shutter.position.y) * 0.25;
      }
      if (ledMat) {
        const on = p.led === "on" || (p.led === "blink" && Math.floor(t * 3) % 2 === 0);
        ledMat.emissive.set(on ? "#ff2a1a" : "#000000");
        ledMat.emissiveIntensity = on ? 4 : 0;
      }
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      api.current = null;
      ro.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // The scene is built once; later prop changes go through api.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.setBeam(props);
  }, [props.segments, props.beamColor, props.powerMw, props.shutterOpen, props.planeZ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.current?.setDynamic(props);
  }, [props.lensInPath, props.lensZ, props.planeZ]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-full">
      <div ref={host} className="absolute inset-0" />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 px-2 py-1 text-[11px] bg-ltor-ink text-white whitespace-nowrap"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {PARTS[hover.part].title}
          {(hover.part === "Lens" || hover.part === "Plane") && " · ziehen zum Verschieben"}
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ltor-alarm">
          3D-Modell konnte nicht geladen werden: {loadError}
        </div>
      )}
    </div>
  );
}

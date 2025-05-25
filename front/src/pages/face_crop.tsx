import { useState, useEffect, useRef, useCallback } from "react";
// import { FaceMesh } from "@mediapipe/face_mesh"; // Original import, will be loaded via script
import {
  Camera,
  Download,
  RefreshCcw, // For dress-up button icon
  Loader2, // For loading spinner
  ArrowLeft, // For back button
} from "lucide-react";

// Script URLs from FaceCropApp - TFJS versions changed to 3.11.0 for compatibility
const TFJS_CORE_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@3.11.0/dist/tf-core.min.js";
const TFJS_CONVERTER_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@3.11.0/dist/tf-converter.min.js";
const TFJS_BACKEND_WEBLG_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@3.11.0/dist/tf-backend-webgl.min.js";
const BODY_SEGMENTATION_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/body-segmentation@1.0.2/dist/body-segmentation.min.js";
const MEDIAPIPE_FACEMESH_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js";

// Guide constants
const GUIDE_COLOR_ALIGNED = "rgba(74, 222, 128, 0.9)";
const GUIDE_COLOR_MISALIGNED = "rgba(239, 68, 68, 0.9)";
const FACE_ELLIPSE_RATIO_Y = 0.35;
const FACE_ELLIPSE_ASPECT_RATIO = 0.9;
const SHOULDER_LINE_Y_RATIO = 0.65;
const SHOULDER_LINE_WIDTH_RATIO = 0.85;
const CENTER_LINE_TOP_Y_RATIO = 0.1;
const CENTER_LINE_BOTTOM_Y_RATIO = 0.9;

// EAR constants
const EAR_THRESHOLD = 0.21;
const BLINK_CONSECUTIVE_FRAMES = 2;

// Landmark Indices
const RIGHT_EYE_INDICES_FOR_EAR = [33, 160, 158, 133, 153, 144];
const LEFT_EYE_INDICES_FOR_EAR = [362, 387, 385, 263, 380, 373];
const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const CHIN_TIP_LANDMARK_INDEX = 152;
const NOSE_TIP_LANDMARK_INDEX = 1;

// Global promise for script loading to ensure it runs once
let allModelScriptsPromise: Promise<void> | null = null;

const loadScript = (src: string, id: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      console.log(`Script ${id} already loaded.`);
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      console.log(`Script ${id} loaded successfully from ${src}.`);
      resolve();
    };
    script.onerror = (event) => {
      console.error(`Failed to load script ${id} from ${src}. Event:`, event);
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });
};

const drawProofPhotoStyleGuide = (
  ctx: CanvasRenderingContext2D | null,
  W: number,
  H: number,
  isCurrentlyAligned: boolean,
  countdownNum: number | null
) => {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = isCurrentlyAligned ? GUIDE_COLOR_ALIGNED : GUIDE_COLOR_MISALIGNED;
  ctx.lineWidth = W * 0.008;
  ctx.setLineDash([W * 0.02, W * 0.01]);
  const centerX = W / 2;

  const ellipseH = H * FACE_ELLIPSE_RATIO_Y;
  const ellipseW = ellipseH * FACE_ELLIPSE_ASPECT_RATIO;
  const ellipseCY = H * 0.35;
  ctx.beginPath();
  ctx.ellipse(centerX, ellipseCY, ellipseW / 2, ellipseH / 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  const shoulderY = H * SHOULDER_LINE_Y_RATIO;
  const shoulderLineWidth = W * SHOULDER_LINE_WIDTH_RATIO;
  ctx.beginPath();
  ctx.moveTo(centerX - shoulderLineWidth / 2, shoulderY);
  ctx.lineTo(centerX + shoulderLineWidth / 2, shoulderY);
  ctx.stroke();

  const centerLineTopY = H * CENTER_LINE_TOP_Y_RATIO;
  const centerLineBottomY = H * CENTER_LINE_BOTTOM_Y_RATIO;
  ctx.beginPath();
  ctx.moveTo(centerX, centerLineTopY);
  ctx.lineTo(centerX, centerLineBottomY);
  ctx.stroke();

  const eyeLineY = ellipseCY - ellipseH * 0.1;
  ctx.setLineDash([W * 0.005, W * 0.005]);
  ctx.lineWidth = W * 0.004;
  ctx.beginPath();
  ctx.moveTo(centerX - ellipseW * 0.3, eyeLineY);
  ctx.lineTo(centerX + ellipseW * 0.3, eyeLineY);
  ctx.stroke();

  const mouthLineY = ellipseCY + ellipseH * 0.25;
  ctx.beginPath();
  ctx.moveTo(centerX - ellipseW * 0.2, mouthLineY);
  ctx.lineTo(centerX + ellipseW * 0.2, mouthLineY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (countdownNum !== null && countdownNum > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    const fontSize = Math.min(W, H) * 0.25;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.fillText(String(countdownNum), W / 2, H / 2);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }
};

const calculateDistance = (
  p1: { x: number; y: number } | undefined,
  p2: { x: number; y: number } | undefined
): number => {
  if (!p1 || !p2) return 0;
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

const calculateEAR = (
  eyeLandmarks: Array<{ x: number; y: number }>,
  videoWidth: number,
  videoHeight: number
): number => {
  if (!eyeLandmarks || eyeLandmarks.length < 6) return 0;
  const p = eyeLandmarks.map((lm: { x: number; y: number }) => ({
    x: lm.x * videoWidth,
    y: lm.y * videoHeight,
  }));
  const p1 = p[0],
    p2 = p[1],
    p3 = p[2],
    p4 = p[3],
    p5 = p[4],
    p6 = p[5];
  const verticalDist1 = calculateDistance(p2, p6);
  const verticalDist2 = calculateDistance(p3, p5);
  const horizontalDist = calculateDistance(p1, p4);
  if (horizontalDist === 0) return 0;
  return (verticalDist1 + verticalDist2) / (2 * horizontalDist);
};

type View = "camera" | "previewModal" | "compositeResult"; // Define possible views

export const CameraFrames = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isComponentMountedRef = useRef(true);

  const faceMeshRef = useRef<any | null>(null);
  const segmenterRef = useRef<any | null>(null);

  const headPartCanvasRef = useRef<HTMLCanvasElement>(null);
  const bodyCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedBodyCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [currentView, setCurrentView] = useState<View>("camera"); // Manage current view

  const [isAligned, setIsAligned] = useState<boolean>(false);
  const [capturedImageURL, setCapturedImageURL] = useState<string | null>(null);
  const [headPartDataUrl, setHeadPartDataUrl] = useState<string | null>(null);
  const [bodyDataUrl, setBodyDataUrl] = useState<string | null>(null);
  const [processedBodyDataUrl, setProcessedBodyDataUrl] = useState<string | null>(null);
  const [compositeDataUrl, setCompositeDataUrl] = useState<string | null>(null);
  const [cropMetadata, setCropMetadata] = useState<any | null>(null);

  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [message, setMessage] = useState({ text: "", type: "success", show: false });
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isProcessingDressUp, setIsProcessingDressUp] = useState(false);

  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [isReadyToShoot, setIsReadyToShoot] = useState<boolean>(false);

  const leftEyeClosedFramesRef = useRef(0);
  const rightEyeClosedFramesRef = useRef(0);
  const latestLandmarksRef = useRef<Array<{ x: number; y: number; z: number }> | null>(null);

  const showAppMessage = useCallback((text: string, type = "success", duration = 3000) => {
    if (isComponentMountedRef.current) {
      setMessage({ text, type, show: true });
      setTimeout(() => {
        if (isComponentMountedRef.current) {
          setMessage((prev) => ({ ...prev, show: false }));
        }
      }, duration);
    }
  }, []);

  const checkAlignmentWithMediaPipe = useCallback(
    (landmarks: Array<{ x: number; y: number; z: number }>) => {
      if (!landmarks || landmarks.length === 0) return false;
      const ellipseH_norm = FACE_ELLIPSE_RATIO_Y;
      const ellipseW_norm = ellipseH_norm * FACE_ELLIPSE_ASPECT_RATIO;
      const ellipseCY_norm = 0.35;
      const ellipseCX_norm = 0.5;
      const ellipseRx_norm = ellipseW_norm / 2;
      const ellipseRy_norm = ellipseH_norm / 2;
      const noseTip = landmarks[NOSE_TIP_LANDMARK_INDEX];
      const chin = landmarks[CHIN_TIP_LANDMARK_INDEX];
      if (!noseTip || !chin) return false;
      const noseInEllipse =
        Math.pow((noseTip.x - ellipseCX_norm) / ellipseRx_norm, 2) +
          Math.pow((noseTip.y - ellipseCY_norm) / ellipseRy_norm, 2) <=
        1.1;
      const chinAligned =
        chin.y > ellipseCY_norm && Math.abs(chin.x - ellipseCX_norm) < ellipseW_norm * 0.5;
      return noseInEllipse && chinAligned;
    },
    []
  );

  const performCropping = useCallback(
    async (
      sourceCanvas: HTMLCanvasElement,
      normalizedLandmarks: Array<{ x: number; y: number; z: number }>,
      segmenterInstance: any
    ): Promise<{ headUrl: string | null; bodyUrl: string | null; meta: any | null }> => {
      if (
        !segmenterInstance ||
        typeof segmenterInstance.segmentPeople !== "function" ||
        !normalizedLandmarks ||
        normalizedLandmarks.length === 0
      ) {
        if (isComponentMountedRef.current)
          showAppMessage("輪郭抽出モデルまたは顔特徴点が準備できていません。", "error");
        console.error("Segmenter not ready or invalid, or landmarks not ready for cropping.", {
          segmenterInstanceExists: !!segmenterInstance,
          segmenterInstance,
          normalizedLandmarks,
        });
        return { headUrl: null, bodyUrl: null, meta: null };
      }

      const W = sourceCanvas.width;
      const H = sourceCanvas.height;
      const keypoints = normalizedLandmarks.map((lm) => ({
        x: lm.x * W,
        y: lm.y * H,
        z: lm.z * W,
      }));
      const overlapPixels = 10;

      let segmentation;
      try {
        segmentation = await segmenterInstance.segmentPeople(sourceCanvas, {
          flipHorizontal: false,
          multiSegmentation: false,
          segmentBodyParts: false,
        });
      } catch (segError) {
        console.error("Error during segmentation:", segError);
        if (isComponentMountedRef.current)
          showAppMessage("輪郭抽出処理中にエラーが発生しました。", "error");
        return { headUrl: null, bodyUrl: null, meta: null };
      }

      if (!segmentation || segmentation.length === 0 || !segmentation[0].mask) {
        if (isComponentMountedRef.current)
          showAppMessage("輪郭抽出に失敗しました (マスク取得不可)。", "error");
        return { headUrl: null, bodyUrl: null, meta: null };
      }
      const maskData = segmentation[0].mask;

      const segmentedPersonCanvas = document.createElement("canvas");
      segmentedPersonCanvas.width = W;
      segmentedPersonCanvas.height = H;
      const spCtx = segmentedPersonCanvas.getContext("2d");
      if (!spCtx) return { headUrl: null, bodyUrl: null, meta: null };

      spCtx.drawImage(sourceCanvas, 0, 0);
      spCtx.globalCompositeOperation = "destination-in";
      try {
        const drawableMask = await maskData.toCanvasImageSource();
        spCtx.drawImage(drawableMask, 0, 0, W, H);
      } catch (maskError) {
        console.error("Error drawing segmentation mask:", maskError);
        if (isComponentMountedRef.current)
          showAppMessage("輪郭マスクの描画に失敗しました。", "error");
        spCtx.globalCompositeOperation = "source-over";
        return { headUrl: null, bodyUrl: null, meta: null };
      }
      spCtx.globalCompositeOperation = "source-over";

      const headCanvas = headPartCanvasRef.current;
      if (!headCanvas) return { headUrl: null, bodyUrl: null, meta: null };

      let ovalMinX = Infinity,
        ovalMinY = Infinity,
        ovalMaxX = -Infinity,
        ovalMaxY = -Infinity;
      FACE_OVAL_INDICES.forEach((index) => {
        const point = keypoints[index];
        if (point) {
          ovalMinX = Math.min(ovalMinX, point.x);
          ovalMinY = Math.min(ovalMinY, point.y);
          ovalMaxX = Math.max(ovalMaxX, point.x);
          ovalMaxY = Math.max(ovalMaxY, point.y);
        }
      });

      const ovalWidth = ovalMaxX - ovalMinX;
      const ovalHeight = ovalMaxY - ovalMinY;
      const chinLandmark = keypoints[CHIN_TIP_LANDMARK_INDEX];

      if (!chinLandmark || ovalWidth <= 0 || ovalHeight <= 0) {
        if (isComponentMountedRef.current)
          showAppMessage("顔の主要な特徴点を取得できませんでした (切り抜き不可)。", "error");
        return { headUrl: null, bodyUrl: null, meta: null };
      }
      const chinLineY = chinLandmark.y;

      const headXPadding = ovalWidth * 0.4;
      const headYPaddingTop = ovalHeight * 1.0;
      const headCropX = Math.max(0, ovalMinX - headXPadding);
      const headCropY = Math.max(0, ovalMinY - headYPaddingTop);
      const headCropWidth = Math.min(W - headCropX, ovalWidth + 2 * headXPadding);

      const headCropBottomExtendedY = Math.min(H, chinLineY + overlapPixels);
      const headCropHeight = Math.min(H - headCropY, headCropBottomExtendedY - headCropY);

      if (headCropHeight <= 0 || headCropWidth <= 0) {
        if (isComponentMountedRef.current)
          showAppMessage("顔の切り抜きサイズが0以下です。", "error");
        return { headUrl: null, bodyUrl: null, meta: null };
      }

      headCanvas.width = headCropWidth;
      headCanvas.height = headCropHeight;
      const headCtx = headCanvas.getContext("2d");
      if (!headCtx) return { headUrl: null, bodyUrl: null, meta: null };
      headCtx.clearRect(0, 0, headCanvas.width, headCanvas.height);
      headCtx.drawImage(
        segmentedPersonCanvas,
        headCropX,
        headCropY,
        headCropWidth,
        headCropHeight,
        0,
        0,
        headCropWidth,
        headCropHeight
      );
      const currentHeadUrl = headCanvas.toDataURL("image/png");
      if (isComponentMountedRef.current) setHeadPartDataUrl(currentHeadUrl);

      const bodyCanvas = bodyCanvasRef.current;
      if (!bodyCanvas) return { headUrl: currentHeadUrl, bodyUrl: null, meta: null };

      const bodyYStartInOriginal = chinLineY;
      let currentBodyUrl: string | null = null;

      if (bodyYStartInOriginal < H) {
        const bodyCropX = 0;
        const bodyCropWidth = W;
        const bodyCropHeight = H - bodyYStartInOriginal;
        if (bodyCropHeight > 0) {
          bodyCanvas.width = bodyCropWidth;
          bodyCanvas.height = bodyCropHeight;
          const bodyCtx = bodyCanvas.getContext("2d");
          if (!bodyCtx) return { headUrl: currentHeadUrl, bodyUrl: null, meta: null };
          bodyCtx.clearRect(0, 0, bodyCanvas.width, bodyCanvas.height);
          bodyCtx.drawImage(
            segmentedPersonCanvas,
            bodyCropX,
            bodyYStartInOriginal,
            bodyCropWidth,
            bodyCropHeight,
            0,
            0,
            bodyCropWidth,
            bodyCropHeight
          );
          currentBodyUrl = bodyCanvas.toDataURL("image/png");
          if (isComponentMountedRef.current) setBodyDataUrl(currentBodyUrl);
        } else {
          bodyCanvas.width = 1;
          bodyCanvas.height = 1;
          const bCtx = bodyCanvas.getContext("2d");
          if (bCtx) bCtx.clearRect(0, 0, 1, 1);
          if (isComponentMountedRef.current) setBodyDataUrl(null);
        }
      } else {
        bodyCanvas.width = 1;
        bodyCanvas.height = 1;
        const bCtx = bodyCanvas.getContext("2d");
        if (bCtx) bCtx.clearRect(0, 0, 1, 1);
        if (isComponentMountedRef.current) setBodyDataUrl(null);
      }

      const currentMeta = {
        headOriginalX: headCropX,
        headOriginalY: headCropY,
        headOriginalWidth: headCropWidth,
        headOriginalHeight: headCropHeight,
        bodyOriginalX: 0,
        bodyOriginalYStart: bodyYStartInOriginal,
        bodyOriginalWidth: W,
        bodyOriginalHeight: currentBodyUrl ? H - bodyYStartInOriginal : 0,
        originalSnapshotWidth: W,
        originalSnapshotHeight: H,
        overlapUsed: overlapPixels,
      };
      if (isComponentMountedRef.current) setCropMetadata(currentMeta);

      console.log("Cropping complete. Head URL:", currentHeadUrl, "Body URL:", currentBodyUrl);
      if (currentBodyUrl) {
        if (isComponentMountedRef.current) showAppMessage("胴体の切り抜きに成功！", "success");
      } else {
        if (isComponentMountedRef.current)
          showAppMessage("胴体の切り抜きに失敗、または胴体部分がありません。", "warning");
      }
      return { headUrl: currentHeadUrl, bodyUrl: currentBodyUrl, meta: currentMeta };
    },
    [showAppMessage]
  );

  const handleCapture = useCallback(
    async (isAutoTriggered = false) => {
      if (!streamRef.current || !videoRef.current) {
        if (isComponentMountedRef.current) showAppMessage("カメラが準備できていません。", "error");
        return;
      }
      const video = videoRef.current;
      if (
        video.videoWidth === 0 ||
        video.videoHeight === 0 ||
        video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA
      ) {
        if (isComponentMountedRef.current) showAppMessage("ビデオデータが不十分です。", "error");
        return;
      }
      if (video.paused) {
        if (isComponentMountedRef.current) showAppMessage("ビデオが一時停止しています。", "error");
        return;
      }
      if (!isAligned && !isAutoTriggered) {
        if (isComponentMountedRef.current)
          showAppMessage("顔をガイドに合わせてください。", "error");
        return;
      }

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) {
        if (isComponentMountedRef.current)
          showAppMessage("画像のキャプチャに失敗しました。", "error");
        return;
      }
      tempCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const dataUrl = tempCanvas.toDataURL("image/png");
      if (dataUrl === "data:," || dataUrl.length < 100) {
        if (isComponentMountedRef.current) showAppMessage("撮影された画像が空です。", "error");
        return;
      }
      if (isComponentMountedRef.current) {
        setCapturedImageURL(dataUrl);
        setProcessedBodyDataUrl(null);
        setCompositeDataUrl(null);
      }

      if (latestLandmarksRef.current && segmenterRef.current) {
        if (isComponentMountedRef.current)
          showAppMessage("顔と胴体の分離処理を開始します...", "info", 2000);
        const cropResult = await performCropping(
          tempCanvas,
          latestLandmarksRef.current,
          segmenterRef.current
        );
        if (cropResult.bodyUrl) {
          console.log("Body Data URL for server:", cropResult.bodyUrl);
        } else {
          console.log("Body cropping failed or no body part found.");
        }
      } else {
        if (isComponentMountedRef.current)
          showAppMessage(
            "輪郭抽出モデルまたは顔特徴点が未準備のため、分離処理をスキップしました。",
            "warning"
          );
        console.warn("Skipping cropping: Landmarks or segmenter not available.", {
          landmarks: latestLandmarksRef.current,
          segmenter: segmenterRef.current,
        });
      }

      if (isComponentMountedRef.current) {
        setShowPreviewModal(true);
        setIsReadyToShoot(false);
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      if (isAutoTriggered) {
        if (isComponentMountedRef.current) showAppMessage("撮影しました！", "success", 2500);
      }
    },
    [isAligned, showAppMessage, performCropping]
  );

  const processMediaPipeResultsLogic = useCallback(
    (results: { multiFaceLandmarks?: Array<Array<{ x: number; y: number; z: number }>> }) => {
      if (!isComponentMountedRef.current || !videoRef.current) return;

      const videoElement = videoRef.current;
      const videoWidth = videoElement.videoWidth;
      const videoHeight = videoElement.videoHeight;
      let currentAlignment = false;
      let blinkDetectedThisFrame = false;

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        latestLandmarksRef.current = landmarks;
        currentAlignment = checkAlignmentWithMediaPipe(landmarks);

        if (isReadyToShoot && countdownValue === null && videoWidth > 0 && videoHeight > 0) {
          const leftEyeLms = LEFT_EYE_INDICES_FOR_EAR.map((i) => landmarks[i]);
          const rightEyeLms = RIGHT_EYE_INDICES_FOR_EAR.map((i) => landmarks[i]);
          const leftEAR = calculateEAR(leftEyeLms, videoWidth, videoHeight);
          const rightEAR = calculateEAR(rightEyeLms, videoWidth, videoHeight);

          if (leftEAR < EAR_THRESHOLD) leftEyeClosedFramesRef.current++;
          else leftEyeClosedFramesRef.current = 0;
          if (rightEAR < EAR_THRESHOLD) rightEyeClosedFramesRef.current++;
          else rightEyeClosedFramesRef.current = 0;

          if (
            leftEyeClosedFramesRef.current >= BLINK_CONSECUTIVE_FRAMES &&
            rightEyeClosedFramesRef.current >= BLINK_CONSECUTIVE_FRAMES
          ) {
            blinkDetectedThisFrame = true;
            leftEyeClosedFramesRef.current = 0;
            rightEyeClosedFramesRef.current = 0;
          }
        }
      } else {
        latestLandmarksRef.current = null;
      }

      if (isComponentMountedRef.current) setIsAligned(currentAlignment);

      if (
        currentAlignment &&
        blinkDetectedThisFrame &&
        isReadyToShoot &&
        !showPreviewModal &&
        countdownValue === null
      ) {
        if (isComponentMountedRef.current) setCountdownValue(3);
        if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
        }
      }

      if (
        isComponentMountedRef.current &&
        videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
        !showPreviewModal &&
        faceMeshRef.current &&
        countdownValue === null
      ) {
        animationFrameIdRef.current = requestAnimationFrame(async () => {
          if (!isComponentMountedRef.current) {
            console.warn("[processMediaPipeResultsLogic-RAF] Component unmounted. Skipping send.");
            return;
          }
          if (
            faceMeshRef.current &&
            typeof faceMeshRef.current.send === "function" &&
            videoRef.current &&
            !videoRef.current.paused
          ) {
            // @ts-ignore
            await faceMeshRef.current.send({ image: videoRef.current });
          } else {
            if (isComponentMountedRef.current) {
              console.warn(
                "[processMediaPipeResultsLogic-RAF] FaceMesh instance closed, invalid, or video paused. Skipping send."
              );
            }
          }
        });
      }
    },
    [checkAlignmentWithMediaPipe, showPreviewModal, countdownValue, isReadyToShoot]
  );

  const processMediaPipeResultsRef = useRef(processMediaPipeResultsLogic);
  useEffect(() => {
    processMediaPipeResultsRef.current = processMediaPipeResultsLogic;
  }, [processMediaPipeResultsLogic]);

  useEffect(() => {
    if (countdownValue === null) return;
    if (!isAligned && countdownValue > 0) {
      if (isComponentMountedRef.current)
        showAppMessage("顔が外れました。カウントダウン中止。", "error");
      if (isComponentMountedRef.current) setCountdownValue(null);

      if (
        isComponentMountedRef.current &&
        streamRef.current &&
        videoRef.current?.srcObject &&
        faceMeshRef.current &&
        !animationFrameIdRef.current
      ) {
        if (faceMeshRef.current && typeof faceMeshRef.current.send === "function") {
          animationFrameIdRef.current = requestAnimationFrame(async () => {
            if (!isComponentMountedRef.current) {
              console.warn("[Countdown-AlignmentFail-RAF] Component unmounted. Skipping send.");
              return;
            }
            if (
              faceMeshRef.current &&
              typeof faceMeshRef.current.send === "function" &&
              videoRef.current &&
              !videoRef.current.paused
            ) {
              // @ts-ignore
              await faceMeshRef.current.send({ image: videoRef.current });
            } else {
              console.warn(
                "[Countdown-AlignmentFail-RAF] FaceMesh instance closed or invalid. Skipping send."
              );
            }
          });
        } else {
          console.warn(
            "[Countdown-AlignmentFail] FaceMesh instance already closed or invalid before scheduling frame."
          );
        }
      }
      return;
    }
    if (countdownValue > 0) {
      if (isComponentMountedRef.current) showAppMessage(String(countdownValue), "info", 950);
      const timerId = setTimeout(() => {
        if (isComponentMountedRef.current)
          setCountdownValue((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
      return () => clearTimeout(timerId);
    } else if (countdownValue === 0) {
      handleCapture(true);
      if (isComponentMountedRef.current) setCountdownValue(null);
    }
  }, [countdownValue, isAligned, handleCapture, showAppMessage]);

  useEffect(() => {
    if (canvasOverlayRef.current && videoRef.current && videoRef.current.videoWidth > 0) {
      const overlayCanvas = canvasOverlayRef.current;
      const overlayCtx = overlayCanvas?.getContext("2d");
      if (overlayCtx && overlayCanvas) {
        if (
          overlayCanvas.width !== videoRef.current.clientWidth ||
          overlayCanvas.height !== videoRef.current.clientHeight
        ) {
          overlayCanvas.width = videoRef.current.clientWidth;
          overlayCanvas.height = videoRef.current.clientHeight;
        }
        drawProofPhotoStyleGuide(
          overlayCtx,
          overlayCanvas.width,
          overlayCanvas.height,
          isAligned,
          countdownValue
        );
      }
    }
  }, [isAligned, countdownValue]);

  const initializeModels = useCallback(async () => {
    if (!isComponentMountedRef.current) {
      console.log("InitializeModels called on unmounted component. Aborting.");
      return;
    }
    if (faceMeshRef.current && segmenterRef.current) {
      console.log("Models already initialized and refs are set.");
      if (isComponentMountedRef.current)
        showAppMessage("モデルの準備が完了しています。", "success", 1500);
      return;
    }

    if (!allModelScriptsPromise) {
      allModelScriptsPromise = (async () => {
        try {
          if (!isComponentMountedRef.current)
            throw new Error("Component unmounted during model script loading.");
          if (isComponentMountedRef.current)
            showAppMessage("AIモデルを読み込み中...", "info", 10000);

          await loadScript(TFJS_CORE_SCRIPT_URL, "tfjs-core");
          if (!isComponentMountedRef.current)
            throw new Error("Component unmounted after tfjs-core.");
          // @ts-ignore
          if (typeof window.tf === "undefined") {
            throw new Error("TensorFlow.js (tf) is not available after loading core script.");
          }

          await loadScript(TFJS_BACKEND_WEBLG_SCRIPT_URL, "tfjs-backend-webgl");
          if (!isComponentMountedRef.current)
            throw new Error("Component unmounted after tfjs-backend-webgl.");

          // @ts-ignore
          if (typeof window.tf.setBackend !== "function") {
            throw new Error("tf.setBackend is not a function after loading webgl backend.");
          }
          // @ts-ignore
          console.log(
            "Available TFJS backends before setBackend:",
            window.tf.getAvailableBackends
              ? window.tf.getAvailableBackends()
              : "getAvailableBackends not found"
          );
          // @ts-ignore
          await window.tf.setBackend("webgl");
          console.log("TFJS backend set to WebGL successfully.");
          // @ts-ignore
          if (typeof window.tf.ready !== "function") {
            throw new Error("tf.ready is not a function.");
          }
          // @ts-ignore
          await window.tf.ready();
          console.log("TFJS WebGL backend is ready.");

          await loadScript(TFJS_CONVERTER_SCRIPT_URL, "tfjs-converter");
          if (!isComponentMountedRef.current)
            throw new Error("Component unmounted after tfjs-converter.");
          // @ts-ignore
          if (!window.tf || typeof window.tf.loadGraphModel !== "function") {
            throw new Error(
              "TFJS loadGraphModel is not available after loading converter. Check TFJS versions and converter script."
            );
          }

          await loadScript(MEDIAPIPE_FACEMESH_SCRIPT_URL, "mediapipe-face-mesh-script");
          if (!isComponentMountedRef.current)
            throw new Error("Component unmounted after face_mesh script.");
          // @ts-ignore
          if (!window.FaceMesh)
            throw new Error("FaceMesh script loaded but FaceMesh not found on window.");

          await loadScript(BODY_SEGMENTATION_SCRIPT_URL, "body-segmentation-script");
          if (!isComponentMountedRef.current)
            throw new Error("Component unmounted after body-segmentation script.");
          // @ts-ignore
          if (!window.bodySegmentation)
            throw new Error(
              "Body Segmentation script loaded but bodySegmentation not found on window."
            );
        } catch (error) {
          console.error("AIモデルのスクリプト読み込みに失敗 (in promise):", error);
          if (isComponentMountedRef.current) {
            showAppMessage(
              `AIモデルのスクリプト読み込みエラー: ${error instanceof Error ? error.message : String(error)}`,
              "error",
              7000
            );
          }
          allModelScriptsPromise = null;
          throw error;
        }
      })();
    }

    try {
      await allModelScriptsPromise;

      if (isComponentMountedRef.current && !faceMeshRef.current) {
        // @ts-ignore
        if (!window.FaceMesh) throw new Error("window.FaceMesh not available for instantiation.");
        // @ts-ignore
        const faceMesh = new window.FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        faceMesh.onResults((results: any) => {
          if (isComponentMountedRef.current) {
            processMediaPipeResultsRef.current(results);
          }
        });
        faceMeshRef.current = faceMesh;
        console.log("FaceMesh model instance created.");
      }

      if (isComponentMountedRef.current && !segmenterRef.current) {
        // @ts-ignore
        if (!window.tf || typeof window.tf.loadGraphModel !== "function") {
          console.error("TFJS or tf.loadGraphModel is not available before creating segmenter.");
          throw new Error("TFJS loadGraphModel is not available.");
        }
        // @ts-ignore
        if (
          !window.bodySegmentation ||
          typeof window.bodySegmentation.createSegmenter !== "function"
        ) {
          throw new Error(
            "window.bodySegmentation.createSegmenter not available for instantiation."
          );
        }
        // @ts-ignore
        const model = window.bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
        // @ts-ignore
        const segmenter = await window.bodySegmentation.createSegmenter(model, {
          runtime: "tfjs",
          modelType: "general",
        });
        segmenterRef.current = segmenter;
        console.log("Body Segmentation model instance created.");
      }

      if (isComponentMountedRef.current && faceMeshRef.current && segmenterRef.current) {
        showAppMessage("全てのAIモデルの準備ができました。", "success", 2000);
      }
    } catch (error) {
      console.error("AIモデルのインスタンス化に失敗:", error);
      if (isComponentMountedRef.current) {
        showAppMessage(
          `AIモデルのインスタンス化エラー: ${error instanceof Error ? error.message : String(error)}`,
          "error",
          7000
        );
      }
      allModelScriptsPromise = null;
    }
  }, [showAppMessage]);

  const handleResize = useCallback(() => {
    if (
      videoRef.current &&
      videoRef.current.srcObject &&
      canvasOverlayRef.current &&
      videoRef.current.videoWidth > 0
    ) {
      const videoElem = videoRef.current;
      const overlayCanvas = canvasOverlayRef.current;
      if (
        overlayCanvas.width !== videoElem.clientWidth ||
        overlayCanvas.height !== videoElem.clientHeight
      ) {
        overlayCanvas.width = videoElem.clientWidth;
        overlayCanvas.height = videoElem.clientHeight;
        const overlayCtx = overlayCanvas.getContext("2d");
        if (overlayCtx) {
          drawProofPhotoStyleGuide(
            overlayCtx,
            overlayCanvas.width,
            overlayCanvas.height,
            isAligned,
            countdownValue
          );
        }
      }
    }
  }, [isAligned, countdownValue]);

  useEffect(() => {
    isComponentMountedRef.current = true;
    let onPlayingHandler: (() => void) | null = null;

    const setupAsync = async () => {
      if (!isComponentMountedRef.current) return;
      setIsInitializing(true);
      try {
        await initializeModels();
        if (!isComponentMountedRef.current) return;

        let s;
        try {
          s = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 960 },
              height: { ideal: 1280 },
              aspectRatio: { ideal: 3 / 4 },
            },
            audio: false,
          });
        } catch (err) {
          console.warn("Rear camera access failed, trying front camera.", err);
          s = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 960 },
              height: { ideal: 1280 },
              aspectRatio: { ideal: 3 / 4 },
            },
            audio: false,
          });
        }

        if (!isComponentMountedRef.current) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          onPlayingHandler = () => {
            if (!isComponentMountedRef.current) return;
            console.log("Video is playing.");
            if (canvasOverlayRef.current && videoRef.current && faceMeshRef.current) {
              handleResize();
              if (isComponentMountedRef.current)
                showAppMessage("カメラの準備ができました。", "success", 2000);

              if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
              }

              if (
                isComponentMountedRef.current &&
                faceMeshRef.current &&
                typeof faceMeshRef.current.send === "function"
              ) {
                animationFrameIdRef.current = requestAnimationFrame(async () => {
                  if (!isComponentMountedRef.current) {
                    console.warn("[Setup-onPlaying-RAF] Component unmounted. Skipping send.");
                    return;
                  }
                  if (
                    faceMeshRef.current &&
                    typeof faceMeshRef.current.send === "function" &&
                    videoRef.current &&
                    !videoRef.current.paused
                  ) {
                    // @ts-ignore
                    await faceMeshRef.current.send({ image: videoRef.current });
                  } else {
                    if (isComponentMountedRef.current)
                      console.warn(
                        "[Setup-onPlaying-RAF] FaceMesh instance closed or invalid. Skipping send."
                      );
                  }
                });
              } else {
                if (isComponentMountedRef.current)
                  console.warn(
                    "[Setup-onPlaying] FaceMesh instance already closed or invalid before scheduling frame."
                  );
              }
            }
          };
          videoRef.current.onloadedmetadata = () => {
            if (!isComponentMountedRef.current || !videoRef.current) return;
            videoRef.current.play().catch((playError) => {
              console.error("Video play error:", playError);
              if (isComponentMountedRef.current)
                showAppMessage(`ビデオ再生エラー: ${playError.message}`, "error");
            });
          };
          videoRef.current.addEventListener("playing", onPlayingHandler);
        }
      } catch (err) {
        console.error("カメラまたはAIモデルのセットアップに失敗:", err);
        if (isComponentMountedRef.current)
          showAppMessage(
            `セットアップ失敗: ${err instanceof Error ? err.message : String(err)}. ページをリロードしてみてください。`,
            "error",
            7000
          );
      } finally {
        if (isComponentMountedRef.current) setIsInitializing(false);
      }
    };

    setupAsync();

    return () => {
      console.log("CameraFrame cleanup initiated...");
      isComponentMountedRef.current = false;

      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        console.log("Animation frame cancelled.");
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        console.log("Media stream stopped.");
      }

      const currentVideoElement = videoRef.current;
      if (currentVideoElement && onPlayingHandler) {
        currentVideoElement.removeEventListener("playing", onPlayingHandler);
        console.log("Video 'playing' event listener removed.");
      }
      if (currentVideoElement && currentVideoElement.srcObject) {
        // @ts-ignore
        const tracks = (currentVideoElement.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
        currentVideoElement.srcObject = null;
        console.log("Video srcObject tracks stopped and cleared.");
      }

      // @ts-ignore
      if (faceMeshRef.current && typeof faceMeshRef.current.close === "function") {
        console.log("Attempting to close FaceMesh instance...");
        try {
          // @ts-ignore
          faceMeshRef.current.close();
          console.log("FaceMesh instance closed.");
        } catch (e) {
          console.error("Error closing FaceMesh:", e);
        }
      }
      faceMeshRef.current = null;

      // @ts-ignore
      if (segmenterRef.current && typeof segmenterRef.current.dispose === "function") {
        console.log("Attempting to dispose Segmenter instance...");
        try {
          // @ts-ignore
          segmenterRef.current.dispose();
          console.log("Segmenter instance disposed.");
        } catch (e) {
          console.error("Error disposing segmenter:", e);
        }
      }
      segmenterRef.current = null;

      allModelScriptsPromise = null;
      console.log("CameraFrame cleanup complete. allModelScriptsPromise reset.");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const handleReadyToShoot = () => {
    if (isInitializing || !faceMeshRef.current || !segmenterRef.current) {
      showAppMessage("AIモデルの準備中です。もう少々お待ちください。", "warning");
      return;
    }
    if (!isAligned) {
      showAppMessage("まず顔をガイドに合わせてください。", "warning");
      return;
    }
    setIsReadyToShoot(true);
    showAppMessage("準備完了！瞬きでカウントダウンを開始します。", "success");
  };

  const combineImages = useCallback(
    async (currentProcessedBodyUrl: string | null) => {
      if (!headPartDataUrl || !currentProcessedBodyUrl || !cropMetadata) {
        if (isComponentMountedRef.current)
          showAppMessage("結合に必要な画像またはメタデータがありません。", "error");
        console.error("Missing data for combining images:", {
          headPartDataUrl,
          currentProcessedBodyUrl,
          cropMetadata,
        });
        return null;
      }

      const headImg = new Image();
      const bodyImg = new Image();
      // Ensure crossOrigin is set if loading from external URLs returned by a server
      // For dataURLs, it's not strictly necessary but doesn't hurt.
      headImg.crossOrigin = "Anonymous";
      bodyImg.crossOrigin = "Anonymous";

      const headPromise = new Promise<void>((resolve, reject) => {
        headImg.onload = () => resolve();
        headImg.onerror = (e) => {
          console.error("Head image load error", e);
          if (isComponentMountedRef.current)
            showAppMessage("頭部画像の読み込みに失敗 (結合処理中)。", "error");
          reject(new Error("Head image load error"));
        };
        headImg.src = headPartDataUrl;
      });

      const bodyPromise = new Promise<void>((resolve, reject) => {
        bodyImg.onload = () => resolve();
        bodyImg.onerror = (e) => {
          console.error("Processed body image load error", e);
          if (isComponentMountedRef.current)
            showAppMessage("加工済み胴体画像の読み込みに失敗 (結合処理中)。", "error");
          reject(new Error("Body image load error"));
        };
        bodyImg.src = currentProcessedBodyUrl;
      });

      try {
        await Promise.all([headPromise, bodyPromise]);

        if (isComponentMountedRef.current) {
          const canvas = compositeCanvasRef.current;
          if (!canvas) return null;

          canvas.width = cropMetadata.originalSnapshotWidth;
          canvas.height = cropMetadata.originalSnapshotHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          ctx.drawImage(
            bodyImg,
            cropMetadata.bodyOriginalX,
            cropMetadata.bodyOriginalYStart,
            bodyImg.width,
            bodyImg.height
          );

          ctx.drawImage(
            headImg,
            cropMetadata.headOriginalX,
            cropMetadata.headOriginalY,
            headImg.width,
            headImg.height
          );

          const finalCompositeUrl = canvas.toDataURL("image/png");
          if (isComponentMountedRef.current) setCompositeDataUrl(finalCompositeUrl);
          return finalCompositeUrl;
        }
        return null;
      } catch (error) {
        console.error("Error loading images for combination:", error);
        return null;
      }
    },
    [headPartDataUrl, cropMetadata, showAppMessage]
  );

  const simulateServerProcessing = useCallback(async () => {
    if (!bodyDataUrl) {
      if (isComponentMountedRef.current) showAppMessage("加工する胴体画像がありません。", "error");
      return;
    }
    if (isComponentMountedRef.current) {
      setIsProcessingDressUp(true);
      showAppMessage("サーバーに胴体情報を送信中...", "info"); // Default duration
    }

    const bodyImageForDimensions = new Image();
    bodyImageForDimensions.onload = async () => {
      if (!isComponentMountedRef.current) {
        setIsProcessingDressUp(false);
        return;
      }
      const bodyWidth = bodyImageForDimensions.naturalWidth;
      const bodyHeight = bodyImageForDimensions.naturalHeight;

      try {
        // base64データをBlobに変換
        const base64Data = bodyDataUrl.replace(/^data:image\/\w+;base64,/, "");
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "image/png" });

        // FormDataを作成
        const formData = new FormData();
        formData.append("image", blob, "body.png");
        // formData.append("width", bodyWidth.toString());
        // formData.append("height", bodyHeight.toString());

        console.log("FormData created. Simulating sending to server with:", {
          width: bodyWidth,
          height: bodyHeight,
          image_size: blob.size,
        });

        // サーバーエンドポイントを実際のURLに置き換えてください
        const serverEndpoint = "http://localhost:8787/api/transform/suit"; //  <--- ★★★ 要変更 ★★★

        if (serverEndpoint.includes("YOUR_SERVER_ENDPOINT")) {
          showAppMessage(
            "サーバーエンドポイントが設定されていません。シミュレーションを続行します。",
            "warning",
            5000
          );
          // Simulate server delay if endpoint is not set
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (!isComponentMountedRef.current) {
            setIsProcessingDressUp(false);
            return;
          }

          // Fallback to local sepia filter simulation if endpoint is placeholder
          showAppMessage("サーバー応答(仮)。胴体をローカルで加工中...", "info", 4000);
          const img = new Image();
          img.onload = async () => {
            if (!isComponentMountedRef.current) {
              setIsProcessingDressUp(false);
              return;
            }
            const canvas = processedBodyCanvasRef.current;
            if (!canvas) {
              setIsProcessingDressUp(false);
              return;
            }
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              setIsProcessingDressUp(false);
              return;
            }
            ctx.filter = "sepia(60%)";
            ctx.drawImage(img, 0, 0);
            ctx.filter = "none";

            const newProcessedBodyDataUrl = canvas.toDataURL("image/png");
            if (isComponentMountedRef.current) {
              setProcessedBodyDataUrl(newProcessedBodyDataUrl);
              const finalUrl = await combineImages(newProcessedBodyDataUrl);
              if (finalUrl) {
                setCurrentView("compositeResult");
                setShowPreviewModal(false);
                showAppMessage("着せ替え完了！結果画面に遷移します。", "success");
              } else {
                showAppMessage("画像の結合に失敗しました。", "error");
              }
            }
          };
          img.onerror = () => {
            if (isComponentMountedRef.current)
              showAppMessage("胴体画像の読み込みに失敗 (ローカル加工中)。", "error");
          };
          img.src = bodyDataUrl; // Process original body for simulation
          setIsProcessingDressUp(false); // Moved finally here for the simulation path
          return; // Exit after local simulation
        }

        // Actual fetch to the server
        const response = await fetch(serverEndpoint, {
          method: "POST",
          body: formData,
        });

        if (!isComponentMountedRef.current) {
          setIsProcessingDressUp(false);
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const responseData = await response.json();
        const processedImageDataFromServer = responseData.image;

        if (!processedImageDataFromServer) {
          throw new Error("サーバーからの応答に加工済み画像データが含まれていません。");
        }

        showAppMessage("サーバーから加工済み画像を受信。結合準備中...", "info", 2000);
        const img = new Image();

        img.onload = async () => {
          if (!isComponentMountedRef.current) {
            setIsProcessingDressUp(false);
            return;
          }

          // Draw the received image to a canvas to get a dataURL for processedBodyDataUrl
          const canvas = processedBodyCanvasRef.current;
          if (!canvas) {
            if (isComponentMountedRef.current) showAppMessage("加工用キャンバスエラー。", "error");
            return;
          }
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            if (isComponentMountedRef.current)
              showAppMessage("加工用キャンバスコンテキストエラー。", "error");
            return;
          }
          ctx.drawImage(img, 0, 0);

          const newProcessedBodyDataUrl = canvas.toDataURL("image/png");

          if (isComponentMountedRef.current) {
            setProcessedBodyDataUrl(newProcessedBodyDataUrl);
            const finalUrl = await combineImages(newProcessedBodyDataUrl);
            if (finalUrl) {
              setCurrentView("compositeResult");
              setShowPreviewModal(false);
              showAppMessage("着せ替え完了！結果画面に遷移します。", "success");
            } else {
              showAppMessage("画像の結合に失敗しました。", "error");
            }
          }
        };
        img.onerror = () => {
          if (isComponentMountedRef.current)
            showAppMessage("サーバーからの加工済み画像の読み込みに失敗。", "error");
        };
        img.src = processedImageDataFromServer;
      } catch (error) {
        console.error("Server communication error:", error);
        if (isComponentMountedRef.current) {
          showAppMessage(
            `サーバー通信エラー: ${error instanceof Error ? error.message : "不明なエラー"}`,
            "error"
          );
        }
      } finally {
        if (isComponentMountedRef.current) {
          setIsProcessingDressUp(false);
        }
      }
    };
    bodyImageForDimensions.onerror = () => {
      if (isComponentMountedRef.current) {
        showAppMessage("胴体寸法の取得に失敗しました。", "error");
        setIsProcessingDressUp(false);
      }
    };
    bodyImageForDimensions.src = bodyDataUrl;
  }, [bodyDataUrl, showAppMessage, combineImages]);

  const handleDressUp = useCallback(() => {
    if (!bodyDataUrl) {
      showAppMessage("着せ替えする胴体画像がありません。", "warning");
      return;
    }
    if (isComponentMountedRef.current) {
      setCompositeDataUrl(null);
    }
    simulateServerProcessing();
  }, [bodyDataUrl, simulateServerProcessing, showAppMessage]);

  const handleDownloadComposite = () => {
    if (compositeDataUrl) {
      const link = document.createElement("a");
      link.href = compositeDataUrl;
      link.download = "composite_image_dress_up.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showAppMessage("結合画像をダウンロードしました！", "success");
    } else {
      showAppMessage("ダウンロードする結合画像がありません。", "warning");
    }
  };

  const handleClosePreviewModal = useCallback(() => {
    if (!isComponentMountedRef.current) return;
    setShowPreviewModal(false);
    setIsReadyToShoot(false);
    setProcessedBodyDataUrl(null);
    setCompositeDataUrl(null);

    if (
      isComponentMountedRef.current &&
      streamRef.current &&
      videoRef.current?.srcObject &&
      faceMeshRef.current &&
      !animationFrameIdRef.current
    ) {
      if (faceMeshRef.current && typeof faceMeshRef.current.send === "function") {
        animationFrameIdRef.current = requestAnimationFrame(async () => {
          if (!isComponentMountedRef.current) {
            console.warn("[handleClosePreviewModal-RAF] Component unmounted. Skipping send.");
            return;
          }
          if (
            faceMeshRef.current &&
            typeof faceMeshRef.current.send === "function" &&
            videoRef.current &&
            !videoRef.current.paused
          ) {
            // @ts-ignore
            await faceMeshRef.current.send({ image: videoRef.current });
          } else {
            if (isComponentMountedRef.current)
              console.warn(
                "[handleClosePreviewModal-RAF] FaceMesh instance closed or invalid during animation frame. Skipping send."
              );
          }
        });
      } else {
        if (isComponentMountedRef.current)
          console.warn(
            "[handleClosePreviewModal] FaceMesh instance already closed or invalid before scheduling frame."
          );
      }
    }
  }, []);

  const handleBackToCamera = () => {
    if (isComponentMountedRef.current) {
      setCurrentView("camera");
      setCapturedImageURL(null);
      setHeadPartDataUrl(null);
      setBodyDataUrl(null);
      setProcessedBodyDataUrl(null);
      setCompositeDataUrl(null);
      setCropMetadata(null);
      setIsAligned(false);
      setCountdownValue(null);
      setIsReadyToShoot(false);
      setShowPreviewModal(false);

      if (
        streamRef.current &&
        videoRef.current?.srcObject &&
        faceMeshRef.current &&
        !animationFrameIdRef.current
      ) {
        if (faceMeshRef.current && typeof faceMeshRef.current.send === "function") {
          animationFrameIdRef.current = requestAnimationFrame(async () => {
            if (!isComponentMountedRef.current) return;
            if (
              faceMeshRef.current &&
              typeof faceMeshRef.current.send === "function" &&
              videoRef.current &&
              !videoRef.current.paused
            ) {
              // @ts-ignore
              await faceMeshRef.current.send({ image: videoRef.current });
            }
          });
        }
      }
    }
  };

  if (currentView === "compositeResult") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-800 p-4 font-sans text-gray-100">
        <h2 className="mb-6 text-3xl font-bold text-purple-400">着せ替え完了！</h2>
        {compositeDataUrl ? (
          <img
            src={compositeDataUrl}
            alt="着せ替え後画像"
            className="max-h-[70vh] max-w-lg rounded-lg border-2 border-purple-500 object-contain shadow-xl"
          />
        ) : (
          <div className="flex flex-col items-center text-gray-400">
            <Loader2 className="mb-4 h-16 w-16 animate-spin text-purple-400" />
            <p>画像を生成中...</p>
          </div>
        )}
        <div className="mt-8 flex gap-4">
          <button
            onClick={handleDownloadComposite}
            disabled={!compositeDataUrl}
            className="focus:ring-opacity-75 flex items-center gap-2 rounded-lg bg-green-500 px-6 py-3 font-semibold text-white shadow transition-colors duration-150 ease-in-out hover:bg-green-600 hover:shadow-md focus:ring-2 focus:ring-green-400 focus:outline-none disabled:opacity-50"
          >
            <Download size={20} /> 保存する
          </button>
          <button
            onClick={handleBackToCamera}
            className="focus:ring-opacity-75 flex items-center gap-2 rounded-lg bg-gray-500 px-6 py-3 font-semibold text-white shadow transition-colors duration-150 ease-in-out hover:bg-gray-600 hover:shadow-md focus:ring-2 focus:ring-gray-400 focus:outline-none"
          >
            <ArrowLeft size={20} /> カメラに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-gray-100 pt-4 font-sans text-gray-800">
      <canvas ref={headPartCanvasRef} className="hidden"></canvas>
      <canvas ref={bodyCanvasRef} className="hidden"></canvas>
      <canvas ref={processedBodyCanvasRef} className="hidden"></canvas>
      <canvas ref={compositeCanvasRef} className="hidden"></canvas>

      <div className="relative mx-auto my-4 aspect-[3/4] w-full max-w-md overflow-hidden rounded-lg bg-black shadow-xl">
        <video
          ref={videoRef}
          id="videoElement"
          autoPlay
          playsInline
          className="block h-full w-full object-cover"
        />
        <canvas
          ref={canvasOverlayRef}
          id="canvasOverlay"
          className="pointer-events-none absolute top-0 left-0 h-full w-full"
        />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-wrap justify-center gap-3 rounded-b-lg bg-white p-4 shadow-md">
        <button
          id="readyToShootButton"
          onClick={handleReadyToShoot}
          disabled={isInitializing || isReadyToShoot || countdownValue !== null || showPreviewModal}
          className="focus:ring-opacity-75 flex cursor-pointer items-center gap-2 rounded-lg bg-green-500 px-5 py-2.5 font-semibold text-white shadow transition-all duration-150 ease-in-out hover:bg-green-600 hover:shadow-md focus:ring-2 focus:ring-green-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400 disabled:opacity-70"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          撮影準備完了
        </button>
        <button
          id="takePhotoButton"
          onClick={() => handleCapture(false)}
          disabled={
            !isAligned ||
            isInitializing ||
            countdownValue !== null ||
            isReadyToShoot ||
            showPreviewModal
          }
          className="focus:ring-opacity-75 flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 font-semibold text-white shadow transition-all duration-150 ease-in-out hover:bg-blue-600 hover:shadow-md focus:ring-2 focus:ring-blue-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400 disabled:opacity-70"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
          手動撮影
        </button>
      </div>
      <div className="mt-3 max-w-md px-4 text-center text-sm text-gray-600">
        「撮影準備完了」を押し、顔をガイドに合わせて瞬きすると3秒後に自動撮影します。撮影後、顔と胴体の分離処理が行われます。
      </div>

      {message.show && (
        <div
          className={`fixed top-5 left-1/2 z-[2000] -translate-x-1/2 rounded-lg px-6 py-3 text-center text-base text-white shadow-xl transition-opacity duration-300 ${message.show ? "opacity-100" : "opacity-0"} ${message.type === "success" ? "bg-emerald-500" : message.type === "warning" ? "bg-yellow-500 text-black" : message.type === "info" ? "bg-sky-500" : "bg-red-500"}`}
        >
          {message.text}
        </div>
      )}

      {showPreviewModal && (
        <div className="bg-opacity-75 fixed inset-0 z-[1500] flex items-center justify-center bg-black p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-y-auto rounded-xl bg-white p-5 text-center shadow-2xl sm:p-6">
            <h3 className="mb-4 text-2xl font-semibold text-gray-800">撮影結果プレビュー</h3>
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex flex-col items-center">
                <h4 className="mb-1 text-lg font-medium">全体像 (元)</h4>
                {capturedImageURL && (
                  <img
                    src={capturedImageURL}
                    alt="撮影プレビュー"
                    className="mx-auto max-h-[40vh] max-w-full rounded-lg border border-gray-200 object-contain"
                  />
                )}
              </div>
              <div className="flex flex-col items-center">
                <h4 className="mb-1 text-lg font-medium">頭部パーツ</h4>
                {headPartDataUrl ? (
                  <img
                    src={headPartDataUrl}
                    alt="頭部パーツ"
                    className="mx-auto max-h-[40vh] max-w-full rounded-lg border border-gray-200 object-contain"
                  />
                ) : (
                  <p className="text-gray-500">なし</p>
                )}
              </div>
              <div className="flex flex-col items-center">
                <h4 className="mb-1 text-lg font-medium">胴体パーツ (元)</h4>
                {bodyDataUrl ? (
                  <img
                    src={bodyDataUrl}
                    alt="胴体パーツ"
                    className="mx-auto max-h-[40vh] max-w-full rounded-lg border border-gray-200 object-contain"
                  />
                ) : (
                  <p className="text-gray-500">なし</p>
                )}
              </div>
            </div>
            <div className="mt-auto flex flex-wrap justify-center gap-3 pt-4">
              <button
                onClick={handleDressUp}
                disabled={!bodyDataUrl || isProcessingDressUp}
                className="focus:ring-opacity-75 flex items-center gap-2 rounded-lg bg-purple-500 px-5 py-2.5 font-semibold text-white shadow transition-colors duration-150 ease-in-out hover:bg-purple-600 hover:shadow-md focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessingDressUp ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <RefreshCcw size={18} />
                )}
                着せ替え (胴体加工)
              </button>
              <button
                onClick={handleClosePreviewModal}
                className="focus:ring-opacity-75 rounded-lg bg-gray-500 px-5 py-2.5 font-semibold text-white shadow transition-colors duration-150 ease-in-out hover:bg-gray-600 hover:shadow-md focus:ring-2 focus:ring-gray-400 focus:outline-none"
              >
                閉じる (再撮影へ)
              </button>
            </div>
          </div>
        </div>
      )}

      {isInitializing && (
        <div className="bg-opacity-80 fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-white backdrop-blur-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
          <p className="mt-4 text-lg text-gray-700">カメラとAIモデルを準備中...</p>
        </div>
      )}
    </div>
  );
};

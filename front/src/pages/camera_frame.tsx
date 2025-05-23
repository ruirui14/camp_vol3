import { useState, useEffect, useRef, useCallback } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";

const GUIDE_COLOR_ALIGNED = "rgba(74, 222, 128, 0.9)";
const GUIDE_COLOR_MISALIGNED = "rgba(239, 68, 68, 0.9)";
const FACE_ELLIPSE_RATIO_Y = 0.35;
const FACE_ELLIPSE_ASPECT_RATIO = 0.75;
const SHOULDER_LINE_Y_RATIO = 0.65;
const SHOULDER_LINE_WIDTH_RATIO = 0.7;
const CENTER_LINE_TOP_Y_RATIO = 0.1;
const CENTER_LINE_BOTTOM_Y_RATIO = 0.9;

// MediaPipeの瞬き検出ようの定数
const EAR_THRESHOLD = 0.21;
const BLINK_CONSECUTIVE_FRAMES = 2;

const drawProofPhotoStyleGuide = (ctx: CanvasRenderingContext2D | null, W: number, H: number, isCurrentlyAligned: boolean, countdownNum: number | null) => {
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

const calculateDistance = (p1: { x: number; y: number } | undefined, p2: { x: number; y: number } | undefined): number => {
  if (!p1 || !p2) return 0;
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

const calculateEAR = (eyeLandmarks: Array<{ x: number; y: number }>, videoWidth: number, videoHeight: number): number => {
  if (!eyeLandmarks || eyeLandmarks.length < 6) return 0;
  const p = eyeLandmarks.map((lm: { x: number; y: number }) => ({ x: lm.x * videoWidth, y: lm.y * videoHeight }));
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

const RIGHT_EYE_INDICES_FOR_EAR = [33, 160, 158, 133, 153, 144];
const LEFT_EYE_INDICES_FOR_EAR = [362, 387, 385, 263, 380, 373];

let mediaPipeLoadPromise: Promise<void> | null = null;
const loadMediaPipeScript = () => {
  if (!mediaPipeLoadPromise) {
    mediaPipeLoadPromise = new Promise<void>((resolve, reject) => {
      if (FaceMesh && typeof FaceMesh === "function") {
        console.log("MediaPipe FaceMesh already loaded.");
        resolve(undefined);
        return;
      }

      const script = document.createElement("script");
      script.src = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js`;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if (FaceMesh && typeof FaceMesh === "function") {
          console.log("MediaPipe FaceMesh script loaded successfully.");
          resolve(undefined);
        } else {
          console.error("MediaPipe FaceMesh script loaded, but window.FaceMesh is not a constructor or not found.");
          reject(new Error("window.FaceMesh is not a constructor or not found after script load."));
        }
      };
      script.onerror = (event) => {
        console.error("Failed to load MediaPipe FaceMesh script. Event:", event);
        reject(new Error("Failed to load MediaPipe FaceMesh script."));
      };
      document.head.appendChild(script);
    });
  }
  return mediaPipeLoadPromise;
};

export const CameraFrame = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);

  const [isAligned, setIsAligned] = useState<boolean>(false);
  const [capturedImageURL, setCapturedImageURL] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [message, setMessage] = useState({ text: "", type: "success", show: false });
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [isReadyToShoot, setIsReadyToShoot] = useState<boolean>(false);

  const leftEyeClosedFramesRef = useRef(0);
  const rightEyeClosedFramesRef = useRef(0);

  const showAppMessage = useCallback((text: string, type = "success", duration = 3000) => {
    setMessage({ text, type, show: true });
    setTimeout(() => setMessage((prev) => ({ ...prev, show: false })), duration);
  }, []);

  const checkAlignmentWithMediaPipe = useCallback((landmarks: Array<{ x: number; y: number }>) => {
    if (!landmarks || landmarks.length === 0) return false;
    const ellipseH_norm = FACE_ELLIPSE_RATIO_Y;
    const ellipseW_norm = ellipseH_norm * FACE_ELLIPSE_ASPECT_RATIO;
    const ellipseCY_norm = 0.35;
    const ellipseCX_norm = 0.5;
    const ellipseRx_norm = ellipseW_norm / 2;
    const ellipseRy_norm = ellipseH_norm / 2;
    const noseTip = landmarks[1];
    const chin = landmarks[152];
    if (!noseTip || !chin) return false;
    const noseInEllipse = Math.pow((noseTip.x - ellipseCX_norm) / ellipseRx_norm, 2) + Math.pow((noseTip.y - ellipseCY_norm) / ellipseRy_norm, 2) <= 1.1;
    const chinAligned = chin.y > ellipseCY_norm && Math.abs(chin.x - ellipseCX_norm) < ellipseW_norm * 0.5;
    return noseInEllipse && chinAligned;
  }, []);

  const handleCapture = useCallback(
    async (isAutoTriggered = false) => {
      if (!streamRef.current || !videoRef.current) {
        showAppMessage("カメラが準備できていません。", "error");
        return;
      }

      const video = videoRef.current;

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        showAppMessage("ビデオの解像度が取得できません。カメラを確認してください。", "error");
        return;
      }
      if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        showAppMessage("ビデオデータが利用できません。少し待ってから再試行してください。", "error");
        return;
      }

      if (video.paused) {
        console.warn(`[handleCapture - ${isAutoTriggered ? "Auto" : "Manual"}] Video is paused before capture attempt.`);
        if (isAutoTriggered) {
          try {
            console.log("[handleCapture - Auto] Attempting to play paused video...");
            await video.play();
            await new Promise((resolve) => setTimeout(resolve, 100)); // Give it a moment to actually start playing
            if (video.paused) {
              console.error("[handleCapture - Auto] Video still paused after play attempt.");
              showAppMessage("ビデオが停止しており撮影できませんでした。", "error");
              return;
            }
            console.log("[handleCapture - Auto] Video resumed.");
          } catch (err) {
            console.error("Error trying to play video before auto-capture:", err);
            showAppMessage("ビデオ再生エラーで撮影失敗", "error");
            return;
          }
        } else {
          showAppMessage("ビデオが一時停止しています。", "error");
          return;
        }
      }

      if (!isAligned && !isAutoTriggered) {
        showAppMessage("顔をガイドに合わせてください。", "error");
        return;
      }

      if (isAutoTriggered) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        console.log(`[handleCapture - Auto after RAF] Video state: paused=${video.paused}, readyState=${video.readyState}, currentTime=${video.currentTime}`);
        await new Promise((resolve) => setTimeout(resolve, 50)); // Increased delay slightly
        console.log(`[handleCapture - Auto after RAF + Delay] Video state: paused=${video.paused}, readyState=${video.readyState}, currentTime=${video.currentTime}`);
      }

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) {
        showAppMessage("画像のキャプチャに失敗しました。", "error");
        return;
      }

      try {
        tempCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      } catch (e) {
        console.error("Error drawing video to canvas:", e);
        showAppMessage("画像の描画に失敗しました。カメラが有効か確認してください。", "error");
        return;
      }

      const dataUrl = tempCanvas.toDataURL("image/png");
      if (dataUrl === "data:," || dataUrl.length < 100) {
        console.error("Captured image data is empty or too short (blank canvas).");
        showAppMessage("撮影された画像が空です。カメラを確認し、再試行してください。", "error");
        return;
      }

      setCapturedImageURL(dataUrl);
      setShowPreviewModal(true);
      setIsReadyToShoot(false);

      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }

      if (isAutoTriggered) {
        showAppMessage("撮影しました！", "success", 2500);
      }
    },
    [isAligned, showAppMessage]
  );

  const processMediaPipeResults = useCallback(
    (results: { multiFaceLandmarks?: Array<Array<{ x: number; y: number }>> }) => {
      if (!videoRef.current) return;

      const videoElement = videoRef.current;
      const videoWidth = videoElement.videoWidth;
      const videoHeight = videoElement.videoHeight;

      let currentAlignment = false;
      let blinkDetectedThisFrame = false;

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        currentAlignment = checkAlignmentWithMediaPipe(landmarks);

        if (isReadyToShoot && countdownValue === null) {
          const leftEyeLms = LEFT_EYE_INDICES_FOR_EAR.map((i) => landmarks[i]);
          const rightEyeLms = RIGHT_EYE_INDICES_FOR_EAR.map((i) => landmarks[i]);
          const leftEAR = calculateEAR(leftEyeLms, videoWidth, videoHeight);
          const rightEAR = calculateEAR(rightEyeLms, videoWidth, videoHeight);

          if (leftEAR < EAR_THRESHOLD) leftEyeClosedFramesRef.current++;
          else leftEyeClosedFramesRef.current = 0;
          if (rightEAR < EAR_THRESHOLD) rightEyeClosedFramesRef.current++;
          else rightEyeClosedFramesRef.current = 0;

          if (leftEyeClosedFramesRef.current >= BLINK_CONSECUTIVE_FRAMES && rightEyeClosedFramesRef.current >= BLINK_CONSECUTIVE_FRAMES) {
            blinkDetectedThisFrame = true;
            leftEyeClosedFramesRef.current = 0;
            rightEyeClosedFramesRef.current = 0;
          }
        }
      }

      setIsAligned((prev) => {
        if (prev !== currentAlignment) return currentAlignment;
        return prev;
      });

      if (currentAlignment && blinkDetectedThisFrame && isReadyToShoot && !showPreviewModal && countdownValue === null) {
        setCountdownValue(3);
        if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
        }
      }

      if (videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && !showPreviewModal && faceMeshRef.current && countdownValue === null) {
        animationFrameIdRef.current = requestAnimationFrame(async () => {
          if (faceMeshRef.current && videoRef.current && !videoRef.current.paused) {
            await faceMeshRef.current.send({ image: videoRef.current });
          }
        });
      }
    },
    [checkAlignmentWithMediaPipe, showPreviewModal, countdownValue, isReadyToShoot]
  );

  useEffect(() => {
    if (countdownValue === null) return;

    if (!isAligned && countdownValue > 0) {
      showAppMessage("顔が外れました。カウントダウン中止。", "error");
      setCountdownValue(null);
      if (streamRef.current && videoRef.current?.srcObject && faceMeshRef.current && !animationFrameIdRef.current) {
        animationFrameIdRef.current = requestAnimationFrame(async () => {
          if (faceMeshRef.current && videoRef.current && !videoRef.current.paused) {
            await faceMeshRef.current.send({ image: videoRef.current });
          }
        });
      }
      return;
    }

    if (countdownValue > 0) {
      showAppMessage(String(countdownValue), "info", 950);
      const timerId = setTimeout(() => {
        setCountdownValue((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
      return () => clearTimeout(timerId);
    } else if (countdownValue === 0) {
      handleCapture(true);
      setCountdownValue(null);
    }
  }, [countdownValue, isAligned, handleCapture, showAppMessage]);

  useEffect(() => {
    if (canvasOverlayRef.current && videoRef.current && videoRef.current.videoWidth > 0) {
      const overlayCanvas = canvasOverlayRef.current;
      const overlayCtx = overlayCanvas?.getContext("2d");
      if (overlayCtx && overlayCanvas) {
        drawProofPhotoStyleGuide(overlayCtx, overlayCanvas.width, overlayCanvas.height, isAligned, countdownValue);
      }
    }
  }, [isAligned, countdownValue]);

  const initializeMediaPipe = useCallback(async () => {
    try {
      await loadMediaPipeScript();

      const faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });
      faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      faceMesh.onResults(processMediaPipeResults);
      faceMeshRef.current = faceMesh;
      showAppMessage("MediaPipeの準備ができました。", "success", 2000);
    } catch (error) {
      console.error("MediaPipeの初期化に失敗:", error);
      showAppMessage("MediaPipeの読み込み/初期化に失敗しました。", "error", 5000);
      throw error;
    }
  }, [processMediaPipeResults, showAppMessage]);

  const handleResize = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject && canvasOverlayRef.current && videoRef.current.videoWidth > 0) {
      const videoElem = videoRef.current;
      const overlayCanvas = canvasOverlayRef.current;
      if (overlayCanvas.width !== videoElem.clientWidth || overlayCanvas.height !== videoElem.clientHeight) {
        overlayCanvas.width = videoElem.clientWidth;
        overlayCanvas.height = videoElem.clientHeight;
      }
      const overlayCtx = overlayCanvas.getContext("2d");
      if (overlayCtx) {
        drawProofPhotoStyleGuide(overlayCtx, overlayCanvas.width, overlayCanvas.height, isAligned, countdownValue);
      }
    }
  }, [isAligned, countdownValue]);

  useEffect(() => {
    const videoElement = videoRef.current;
    let onPlayingHandler: (() => void) | null = null;

    const setup = async () => {
      setIsInitializing(true);
      showAppMessage("初期化中...", "success", 3000);
      try {
        await initializeMediaPipe();
        let s;
        try {
          s = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 960 }, // 3の倍数
              height: { ideal: 1280 }, // 4の倍数
              aspectRatio: { ideal: 3 / 4 }, // 直接アスペクト比を指定
            },
            audio: false,
          });
        } catch (err) {
          let errName = "Unknown Error",
            errMessage = "Rear camera access failed.";
          if (err instanceof Error) {
            errName = err.name;
            errMessage = err.message;
          } else if (typeof err === "object" && err !== null && "name" in err && "message" in err) {
            errName = String(err.name);
            errMessage = String(err.message);
          }
          console.warn(`背面カメラアクセスエラー: ${errName} - ${errMessage}`);
          console.warn(`背面カメラアクセスエラー（アスペクト比指定時）: ${err instanceof Error ? err.name : String(err)}`);
          s = await navigator.mediaDevices.getUserMedia({
            // 前面カメラも同様に
            video: {
              facingMode: "user",
              width: { ideal: 960 },
              height: { ideal: 1280 },
              aspectRatio: { ideal: 3 / 4 },
            },
            audio: false,
          });
        }
        streamRef.current = s;
        if (videoElement) {
          videoElement.srcObject = s;

          onPlayingHandler = () => {
            console.log("Video is playing.");
            if (canvasOverlayRef.current && videoElement && faceMeshRef.current) {
              handleResize();
              showAppMessage("カメラの準備ができました。", "success", 2000);
              if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);

              const startProcessing = async () => {
                if (faceMeshRef.current && videoElement && videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && !videoElement.paused) {
                  animationFrameIdRef.current = requestAnimationFrame(async () => {
                    if (faceMeshRef.current && videoElement && !videoElement.paused) {
                      await faceMeshRef.current.send({ image: videoElement });
                    }
                  });
                }
              };
              startProcessing();
            }
          };

          videoElement.onloadedmetadata = () => {
            console.log("Video metadata loaded.");
            videoElement.play().catch((playError) => {
              console.error("Error attempting to play video:", playError);
              showAppMessage("ビデオの再生に失敗しました。", "error");
            });
          };
          videoElement.addEventListener("playing", onPlayingHandler);
        }
      } catch (err) {
        console.error("カメラまたはMediaPipeのセットアップに失敗:", err);
        showAppMessage("セットアップに失敗しました。", "error", 5000);
      } finally {
        setIsInitializing(false);
      }
    };

    setup();

    return () => {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
      if (faceMeshRef.current && typeof faceMeshRef.current.close === "function") {
        faceMeshRef.current.close();
      }
      if (videoElement && onPlayingHandler) {
        videoElement.removeEventListener("playing", onPlayingHandler);
      }
    };
  }, [initializeMediaPipe, showAppMessage, handleResize]);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const handleReadyToShoot = () => {
    if (isInitializing) {
      showAppMessage("カメラの準備中です。もう少々お待ちください。", "warning");
      return;
    }
    if (!isAligned) {
      showAppMessage("まず顔をガイドに合わせてください。", "warning");
      return;
    }
    setIsReadyToShoot(true);
    showAppMessage("準備完了！瞬きでカウントダウンを開始します。", "success");
  };

  const handleDownload = () => {
    if (capturedImageURL) {
      const link = document.createElement("a");
      link.href = capturedImageURL;
      link.download = "proof_photo_capture.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showAppMessage("画像をダウンロードしました！", "success");
    }
  };

  const handleClosePreviewModal = useCallback(() => {
    setShowPreviewModal(false);
    setCapturedImageURL(null);
    setIsReadyToShoot(false);
    if (streamRef.current && videoRef.current?.srcObject && faceMeshRef.current && !animationFrameIdRef.current) {
      const startProcessing = async () => {
        if (faceMeshRef.current && videoRef.current && videoRef.current.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && !videoRef.current.paused) {
          animationFrameIdRef.current = requestAnimationFrame(async () => {
            if (faceMeshRef.current && videoRef.current && !videoRef.current.paused) {
              await faceMeshRef.current.send({ image: videoRef.current });
            }
          });
        }
      };
      startProcessing();
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-gray-100 pt-4 text-gray-800">
      <div className="relative w-full max-w-xl mx-auto my-4 rounded-lg overflow-hidden shadow-lg bg-black aspect-[3/4]">
        <video ref={videoRef} id="videoElement" autoPlay playsInline className="w-full h-full object-cover block" />
        <canvas ref={canvasOverlayRef} id="canvasOverlay" className="absolute top-0 left-0 w-full h-full pointer-events-none" />
      </div>

      <div className="flex flex-wrap justify-center gap-2 p-4 bg-white border-t border-gray-200 w-full max-w-xl">
        <button id="readyToShootButton" onClick={handleReadyToShoot} disabled={isInitializing || isReadyToShoot || countdownValue !== null} className="bg-green-500 text-white font-semibold py-2 px-5 rounded-md cursor-pointer transition-colors hover:bg-green-600 disabled:bg-gray-400 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          撮影準備完了
        </button>
        <button id="takePhotoButton" onClick={() => handleCapture(false)} disabled={!isAligned || isInitializing || countdownValue !== null || isReadyToShoot} className="bg-blue-500 text-white font-semibold py-2 px-5 rounded-md cursor-pointer transition-colors hover:bg-blue-600 disabled:bg-gray-400 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path>
            <line x1="12" y1="22" x2="12" y2="18"></line>
          </svg>
          手動撮影
        </button>
      </div>
      <div className="text-sm text-gray-600 mt-2 max-w-xl text-center px-2">「撮影準備完了」を押し、顔をガイドに合わせて瞬きすると3秒後に撮影します。</div>

      {message.show && <div className={`fixed top-2.5 left-1/2 -translate-x-1/2 text-white py-3 px-5 rounded-md shadow-md z-[2000] text-sm text-center ${message.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}>{message.text}</div>}

      {showPreviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[1500] p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto text-center">
            <h3 className="text-xl font-semibold mb-3">撮影結果</h3>
            {capturedImageURL && <img id="previewImage" src={capturedImageURL} alt="撮影プレビュー" className="max-w-full max-h-[60vh] rounded-md mb-4 mx-auto" />}
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {/* TODO: 仮実装、着せ替えAPIに実際にリクエストする */}
              <button onClick={handleDownload} className="bg-blue-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-600">
                ダウンロード
              </button>
              <button onClick={handleClosePreviewModal} className="bg-gray-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {isInitializing && (
        <div className="fixed inset-0 bg-white bg-opacity-80 flex flex-col justify-center items-center z-[3000]">
          <div className="border-4 border-gray-200 border-t-blue-500 rounded-full w-10 h-10 animate-spin"></div>
          <p className="ml-3 text-gray-700 mt-2">カメラを準備中...</p>
        </div>
      )}
    </div>
  );
};

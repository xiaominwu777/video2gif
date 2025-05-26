"use client";
import Image from "next/image";
import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

declare global {
  interface SimpleEventEmitter {
    on<T = unknown>(event: string, listener: (...args: T[]) => void): this;
  }
  interface GIFStreamOutput {
    bin: number[];
  }

  interface GIFEncoderInstance {
    setRepeat: (repeat: number) => void;
    setDelay: (delay: number) => void;
    setQuality: (quality: number) => void;
    setSize: (width: number, height: number) => void;
    stream: () => GIFStreamOutput; // Changed return type
    start: () => boolean;
    addFrame: (
      context: CanvasRenderingContext2D | ImageData,
      is_imageData?: boolean
    ) => boolean;
    finish: () => boolean;
  }

  interface Window {
    GIFEncoder: { new (): GIFEncoderInstance } | undefined;
    LZWEncoder: unknown;
    NeuQuant: unknown;
  }
}

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null
  ); // To store the video element itself
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [scriptsReady, setScriptsReady] = useState<boolean>(false);

  // Refs for DOM elements we might need to interact with directly (e.g., for dimensions, or gif.js interaction)
  const videoRef = useRef<HTMLVideoElement>(null); // For the video player
  const canvasRef = useRef<HTMLCanvasElement>(null); // For gif.js frame capture (will need to add this element)

  // Configurable values from main.js (can be turned into state if they need to be dynamic)
  const FPS = 10;
  const DEFAULT_QUALITY = 10;

  // States for GIF conversion parameters, mirroring main.js inputs
  const [startVidPos, setStartVidPos] = useState<number>(0.0);
  const [endVidPos, setEndVidPos] = useState<number>(0.0);
  const [gifWidth, setGifWidth] = useState<number>(0);
  const [gifHeight, setGifHeight] = useState<number>(0);
  const [gifQuality, setGifQuality] = useState<number>(DEFAULT_QUALITY);

  const [showMainInterface, setShowMainInterface] = useState<boolean>(false);
  const [generatedGifSrc, setGeneratedGifSrc] = useState<string | null>(null);

  // Constants for GIF dimensions
  const MAX_GIF_DIMENSION = 600;
  const DEFAULT_GIF_DIMENSION = 300;

  // // Add function to calculate aspect ratio scaling
  const calculateAspectRatio = (width: number, height: number) => {
    // First scale down to default size if larger
    let newWidth = width;
    let newHeight = height;

    if (width > DEFAULT_GIF_DIMENSION || height > DEFAULT_GIF_DIMENSION) {
      const aspectRatio = width / height;
      if (width > height) {
        newWidth = DEFAULT_GIF_DIMENSION;
        newHeight = Math.round(newWidth / aspectRatio);
      } else {
        newHeight = DEFAULT_GIF_DIMENSION;
        newWidth = Math.round(newHeight * aspectRatio);
      }
    }

    // Then ensure we don't exceed maximum dimensions
    if (newWidth <= MAX_GIF_DIMENSION && newHeight <= MAX_GIF_DIMENSION) {
      return { width: newWidth, height: newHeight };
    }

    const aspectRatio = width / height;
    if (width > height) {
      const newWidth = MAX_GIF_DIMENSION;
      const newHeight = Math.round(newWidth / aspectRatio);
      return { width: newWidth, height: newHeight };
    } else {
      const newHeight = MAX_GIF_DIMENSION;
      const newWidth = Math.round(newHeight * aspectRatio);
      return { width: newWidth, height: newHeight };
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
    event.currentTarget.classList.remove("drag-over");
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add("drag-over");
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove("drag-over");
  };

  const processFile = (file: File) => {
    const acceptedFileTypes = [
      ".mp4",
      ".webm",
      ".mov",
      ".avi",
      ".mpeg",
      ".flv",
      ".3gp",
    ].map((ext) => ext.toLowerCase());

    const acceptedMimeTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime", // .mov files
      "video/x-msvideo",
      "video/mpeg",
      "video/x-flv",
      "video/3gpp",
    ];

    // Check file size (max 1GB)
    const maxSize = 1000 * 1024 * 1024; // 1GB in bytes
    if (file.size > maxSize) {
      setError(
        `File size exceeds limit (max 1GB), current file size: ${(
          file.size /
          (1024 * 1024)
        ).toFixed(2)}MB`
      );
      resetFileUploadState();
      return;
    }

    const fileExtension = file.name
      .substring(file.name.lastIndexOf("."))
      .toLowerCase();
    const fileTypeSupported =
      acceptedFileTypes.includes(fileExtension) ||
      acceptedMimeTypes.includes(file.type);

    if (!fileTypeSupported) {
      setError(
        `Unsupported file type (${
          file.type || "Unknown type"
        }).\nSupported formats: ${acceptedFileTypes.join(", ")}`
      );
      resetFileUploadState();
      return;
    }

    setError(null);
    setVideoFile(file);

    try {
      const objectUrl = URL.createObjectURL(file);
      setVideoSrc(objectUrl);
      setShowMainInterface(true);
      setGeneratedGifSrc(null);
    } catch (error) {
      console.error("Failed to create video URL:", error);
      setError("Failed to process video file, please try again");
      resetFileUploadState();
    }
  };

  const resetFileUploadState = () => {
    setVideoFile(null);
    setVideoSrc(null);
    setShowMainInterface(false);
    setGeneratedGifSrc(null);
    setVideoElement(null);
    const uploadInput = document.getElementById("upload") as HTMLInputElement;
    if (uploadInput) {
      uploadInput.value = ""; // Clear the file input
    }
  };

  // Clean up URL.createObjectURL on component unmount
  useEffect(() => {
    return () => {
      if (videoSrc && videoSrc.startsWith("blob:")) {
        URL.revokeObjectURL(videoSrc);
      }
    };
  }, [videoSrc]);

  // Update video load event handler
  useEffect(() => {
    const video = videoRef.current;
    if (video && videoSrc) {
      const handleLoadedMetadata = () => {
        setVideoElement(video);
        const { width, height } = calculateAspectRatio(
          video.videoWidth,
          video.videoHeight
        );
        setGifWidth(width);
        setGifHeight(height);
        setEndVidPos(video.duration);
      };
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      if (video.readyState >= 2) {
        handleLoadedMetadata();
      }
      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      };
    }
  }, [videoSrc]);

  const handleClearCache = () => {
    resetFileUploadState();
    setError(null);
    setStartVidPos(0.0);
    setEndVidPos(0.0);
    setGifWidth(0);
    setGifHeight(0);
    setGifQuality(DEFAULT_QUALITY);
    setIsConverting(false);
    console.log("Cache cleared (state reset)");
  };

  const handleUseCurrentTime = (type: "start" | "end") => {
    if (videoRef.current) {
      const currentTime = parseFloat(videoRef.current.currentTime.toFixed(2));
      if (type === "start") {
        if (endVidPos > 0 && currentTime >= endVidPos) {
          setError("Start time cannot be greater than or equal to end time.");
          return;
        }
        setStartVidPos(currentTime);
      } else {
        if (currentTime <= startVidPos) {
          setError("End time cannot be less than or equal to start time.");
          return;
        }
        setEndVidPos(currentTime);
      }
      setError(null); // Clear error if setting was successful
    }
  };

  const handleConvert = async () => {
    console.log(
      "Inside handleConvert - typeof window.GIFEncoder:",
      typeof window.GIFEncoder,
      "Value:",
      window.GIFEncoder
    );
    if (!videoElement || !canvasRef.current || !videoFile) {
      setError("Video or canvas not ready. Please upload a video.");
      return;
    }
    if (startVidPos >= endVidPos) {
      setError("Start time must be less than end time.");
      return;
    }
    if (gifWidth <= 0 || gifHeight <= 0) {
      setError("GIF dimensions must be greater than 0.");
      return;
    }

    if (!window.GIFEncoder) {
      setError("GIFEncoder constructor not found on window object.");
      console.error("window.GIFEncoder is not available.");
      setIsConverting(false);
      return;
    }
    setError(null);
    setIsConverting(true);
    setGeneratedGifSrc(null);

    try {
      const encoder = new window.GIFEncoder();

      // Initialize encoder
      if (!encoder.start()) {
        throw new Error("Failed to initialize GIF encoder");
      }

      encoder.setRepeat(0); // 0 for loop continuously
      encoder.setDelay(Math.round(1000 / FPS)); // Delay between frames in ms
      encoder.setQuality(gifQuality); // Lower is better quality
      encoder.setSize(gifWidth, gifHeight);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        throw new Error("Could not get canvas context.");
      }
      canvas.width = gifWidth;
      canvas.height = gifHeight;

      const video = videoElement;
      video.pause();

      let currentTime = startVidPos;
      const frameCount = Math.ceil((endVidPos - startVidPos) * FPS);
      let processedFrames = 0;

      console.log("Starting GIF conversion:", {
        startTime: startVidPos,
        endTime: endVidPos,
        frameCount,
        fps: FPS,
        width: gifWidth,
        height: gifHeight,
        quality: gifQuality,
      });

      const captureFrame = async () => {
        if (currentTime > endVidPos) {
          finalizeGif();
          return;
        }

        try {
          video.currentTime = currentTime;
          await new Promise<void>((resolve, reject) => {
            const onSeeked = () => {
              try {
                video.removeEventListener("seeked", onSeeked);
                // Clear canvas and draw current frame
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );
                console.log(
                  `Processing frame ${
                    processedFrames + 1
                  }/${frameCount} at time ${currentTime.toFixed(2)}s`
                );

                if (!encoder.addFrame(imageData, true)) {
                  reject(
                    new Error(`Failed to add frame ${processedFrames + 1}`)
                  );
                  return;
                }
                processedFrames++;
                resolve();
              } catch (err) {
                reject(err);
              }
            };
            video.addEventListener("seeked", onSeeked);
          });

          currentTime += 1 / FPS;
          if (currentTime <= endVidPos) {
            requestAnimationFrame(captureFrame);
          } else {
            finalizeGif();
          }
        } catch (err: unknown) {
          console.error("Error capturing frame:", err);
          setError(
            "Error capturing frame: " +
              (err instanceof Error ? err.message : "Unknown error")
          );
          setIsConverting(false);
        }
      };

      const finalizeGif = () => {
        try {
          console.log("Finalizing GIF...");
          if (!encoder.finish()) {
            throw new Error("Failed to finalize GIF");
          }

          const finalStreamOutput = encoder.stream();
          if (!finalStreamOutput || !finalStreamOutput.bin) {
            throw new Error("Failed to retrieve GIF data after finalizing");
          }

          console.log("GIF data size:", finalStreamOutput.bin.length, "bytes");
          const gifBlob = new Blob([new Uint8Array(finalStreamOutput.bin)], {
            type: "image/gif",
          });
          console.log("Created GIF blob:", gifBlob.size, "bytes");

          const gifUrl = URL.createObjectURL(gifBlob);
          setGeneratedGifSrc(gifUrl);
          setIsConverting(false);
          console.log("GIF Conversion successful");
        } catch (err: unknown) {
          console.error("Error finalizing GIF:", err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(
            "Error finalizing GIF: " + (errorMessage ?? "Unknown error")
          );
          setIsConverting(false);
        }
      };

      // Start the frame capture process
      video.currentTime = startVidPos;
      await new Promise<void>((resolve) => {
        const onInitialSeeked = () => {
          video.removeEventListener("seeked", onInitialSeeked);
          resolve();
        };
        video.addEventListener("seeked", onInitialSeeked);
      });
      captureFrame();
    } catch (err: unknown) {
      console.error("Error in conversion process:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError("Error in conversion process: " + errorMessage);
      setIsConverting(false);
    }
  };

  const handleSaveGif = () => {
    if (!generatedGifSrc || !videoFile) return;
    try {
      const link = document.createElement("a");
      link.href = generatedGifSrc;
      const fileName =
        videoFile.name.substring(0, videoFile.name.lastIndexOf(".")) || "video";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.download = `${fileName}-${timestamp}.gif`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      console.error("Error saving GIF:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError("Error saving GIF: " + errorMessage);
    }
  };

  // Handle dimension change
  const handleDimensionChange = (
    changedDim: "width" | "height",
    value: number
  ) => {
    if (!videoElement || value <= 0) return;

    const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
    let newWidth, newHeight;

    if (changedDim === "width") {
      newWidth = Math.min(value, MAX_GIF_DIMENSION);
      newHeight = Math.round(newWidth / aspectRatio);
      if (newHeight > MAX_GIF_DIMENSION) {
        newHeight = MAX_GIF_DIMENSION;
        newWidth = Math.round(newHeight * aspectRatio);
      }
    } else {
      newHeight = Math.min(value, MAX_GIF_DIMENSION);
      newWidth = Math.round(newHeight * aspectRatio);
      if (newWidth > MAX_GIF_DIMENSION) {
        newWidth = MAX_GIF_DIMENSION;
        newHeight = Math.round(newWidth / aspectRatio);
      }
    }

    setGifWidth(newWidth);
    setGifHeight(newHeight);
  };

  // // Add script loading check function
  const checkScriptsLoaded = () => {
    const isGIFEncoderReady = typeof window.GIFEncoder === "function";
    const isLZWEncoderReady = typeof window.LZWEncoder !== "undefined";
    const isNeuQuantReady = typeof window.NeuQuant !== "undefined";

    console.log("Checking script loading status:", {
      GIFEncoder: isGIFEncoderReady,
      LZWEncoder: isLZWEncoderReady,
      NeuQuant: isNeuQuantReady,
    });

    if (isGIFEncoderReady && isLZWEncoderReady && isNeuQuantReady) {
      setScriptsReady(true);
      console.log("All required scripts have been loaded");
      return true; // Return true if all scripts are loaded
    }
    return false; // Return false if any scripts are not loaded
  };

  // Update script loading status check
  useEffect(() => {
    // Check scripts loaded immediately
    if (checkScriptsLoaded()) {
      return; // If already loaded, no need to set interval
    }

    // Check scripts loaded periodically
    const interval = setInterval(() => {
      if (checkScriptsLoaded()) {
        clearInterval(interval); // Clear interval if all scripts are loaded
      }
    }, 1000);

    return () => {
      clearInterval(interval); //  Clear interval
    };
  }, []);

  // Update conversion button state check
  const canConvert = useMemo(() => {
    const isReady =
      videoElement &&
      canvasRef.current &&
      scriptsReady &&
      !isConverting &&
      startVidPos < endVidPos &&
      gifWidth > 0 &&
      gifHeight > 0;

    console.log("Conversion button state details:", {
      videoElement: !!videoElement,
      canvas: !!canvasRef.current,
      scriptsReady,
      notConverting: !isConverting,
      validTimeRange: startVidPos < endVidPos,
      validDimensions: gifWidth > 0 && gifHeight > 0,
      startVidPos,
      endVidPos,
      gifWidth,
      gifHeight,
    });

    return isReady;
  }, [
    videoElement,
    scriptsReady,
    isConverting,
    startVidPos,
    endVidPos,
    gifWidth,
    gifHeight,
  ]);

  // Add play control state
  const [isPlaying, setIsPlaying] = useState(false);

  // Add play control function
  const handlePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // // Listen for video playback end
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setIsPlaying(false);
    };

    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Add temporary input state
  const [startTimeInput, setStartTimeInput] = useState<string>("0.00");
  const [endTimeInput, setEndTimeInput] = useState<string>("0.00");

  // Update input state when video loads
  useEffect(() => {
    if (videoElement) {
      setStartTimeInput(startVidPos.toFixed(2));
      setEndTimeInput(endVidPos.toFixed(2));
    }
  }, [videoElement, startVidPos, endVidPos]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav
        className={`top-0 w-full bg-card shadow-sm py-2 z-50 ${
          !showMainInterface ? "hidden" : ""
        }`}
      >
        <div className="container mx-auto px-4">
          <ul className="flex justify-end">
            <li>
              <button
                id="clearCache"
                type="button"
                onClick={handleClearCache}
                className="inline-flex items-center px-3 py-1 text-sm rounded-[var(--radius)] border border-primary text-primary hover:bg-secondary/50"
                title="Clear current video and start over"
              >
                <span className="mr-1">🔄</span>
                Start Over
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <main className="min-h-screen bg-background/95 dark:bg-background/98 pt-16 pb-16">
        <div className="container mx-auto px-4">
          <div className="flex justify-center">
            <div className="w-full max-w-[1440px]">
              {!showMainInterface && (
                <>
                  {/* Main Title Section */}
                  <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary mb-6">
                      Video to GIF Converter
                      <span className="text-lg md:text-xl lg:text-2xl block mt-2 text-muted-foreground font-normal">
                        Free Online Converter · No Upload Required · Local
                        Processing
                      </span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                      Quickly convert videos to GIF animations, processed
                      entirely in your browser without uploading to any server.
                      Customize time segments, dimensions, and quality while
                      keeping your privacy secure.
                    </p>
                  </div>

                  {/* File Upload Area */}
                  <div
                    id="dropFileZone"
                    className="border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/50 transition-colors rounded-[var(--radius)] p-4 mb-12"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <div className="text-center py-8">
                      <h2 className="text-4xl font-bold text-primary mb-4">
                        Drop Files Here
                      </h2>
                      <div className="text-muted-foreground mb-4">or</div>
                      <label
                        htmlFor="upload"
                        className="inline-block px-4 py-2 mb-3 text-lg bg-primary text-primary-foreground rounded-[var(--radius)] cursor-pointer hover:bg-primary/90 transition-colors"
                        title="Supported formats: MP4, WebM, MOV, AVI, MPEG, FLV, 3GP"
                      >
                        <input
                          id="upload"
                          type="file"
                          accept=".mp4,.webm,.mov,.avi,.mpeg,.flv,.3gp,video/mp4,video/webm,video/quicktime,video/x-msvideo,video/mpeg,video/x-flv,video/3gpp"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <span className="mr-2">📂</span>
                        Choose File
                      </label>
                      <div className="text-sm text-muted-foreground">
                        Supported formats: MP4, WebM, MOV, AVI, MPEG, FLV, 3GP
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Error Message */}
              {error && (
                <div
                  className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-[var(--radius)] mb-4"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Main Interface */}
              {showMainInterface && videoSrc && (
                <div className="bg-card border border-border rounded-[var(--radius)] shadow-sm">
                  <div className="p-4">
                    <div className="lg:flex lg:gap-6">
                      {/* Left: Video Preview */}
                      <div className="lg:w-2/3">
                        <div className="mb-4 text-center">
                          <div
                            className="inline-block relative"
                            style={{ maxHeight: "70vh" }}
                          >
                            <div className="transform rotate-180 origin-center">
                              <video
                                ref={videoRef}
                                src={videoSrc}
                                playsInline
                                preload="metadata"
                                className="max-w-full mx-auto rounded-[var(--radius)] shadow-sm bg-primary-foreground"
                                style={{ maxHeight: "70vh" }}
                                onLoadedMetadata={(e) => {
                                  const vid = e.currentTarget;
                                  console.log(
                                    "Video metadata loaded successfully:",
                                    {
                                      width: vid.videoWidth,
                                      height: vid.videoHeight,
                                      duration: vid.duration,
                                      type: videoFile?.type,
                                    }
                                  );
                                  setVideoElement(vid);
                                  const { width, height } =
                                    calculateAspectRatio(
                                      vid.videoWidth,
                                      vid.videoHeight
                                    );
                                  setGifWidth(width);
                                  setGifHeight(height);
                                  setStartVidPos(0);
                                  setEndVidPos(vid.duration);
                                }}
                                onError={(e) => {
                                  const vid = e.currentTarget;
                                  const errorMessage = vid.error
                                    ? `Error code: ${vid.error.code}, Message: ${vid.error.message}`
                                    : "Unknown error";
                                  console.error("Video loading error:", {
                                    error: errorMessage,
                                    videoType: videoFile?.type,
                                    videoSize: videoFile?.size,
                                    src: videoSrc,
                                  });
                                  setError(
                                    `Failed to load video: ${errorMessage}\nPlease check if the file format is correct or try another video file`
                                  );
                                }}
                              />
                            </div>
                            {/* Custom playback control */}
                            <div className="mt-2">
                              <button
                                onClick={handlePlayPause}
                                className="inline-flex items-center justify-center w-8 h-8 mr-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90"
                                title={isPlaying ? "Pause" : "Play"}
                              >
                                {isPlaying ? "⏸️" : "▶️"}
                              </button>
                              <span className="text-sm text-muted-foreground">
                                {videoElement
                                  ? "Duration: " +
                                    videoElement.duration.toFixed(1) +
                                    "s"
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* GIF Preview */}
                        {generatedGifSrc && (
                          <div className="mt-4 text-center">
                            <div className="inline-block bg-card p-3 rounded-[var(--radius)] shadow">
                              <Image
                                src={generatedGifSrc}
                                alt="Generated GIF"
                                width={gifWidth}
                                height={gifHeight}
                                className="rounded-[var(--radius)]"
                              />
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={handleSaveGif}
                                  className="px-4 py-2 bg-primary text-primary-foreground rounded-[var(--radius)] hover:bg-primary/90"
                                >
                                  <span className="mr-2">💾</span>
                                  Save GIF
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Control Panel */}
                      <div className="lg:w-1/3 lg:min-w-[320px]">
                        <div className="space-y-6">
                          {/* Time Control */}
                          <section className="space-y-4">
                            <h2 className="text-xl font-medium mb-2">
                              Time Settings
                            </h2>
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="flex items-center w-20">
                                    <span className="mr-1">🎬</span>
                                    Start Time
                                  </span>
                                  <div className="flex-1">
                                    <input
                                      type="text"
                                      className="w-full px-3 py-2 border rounded-[var(--radius)] focus:ring-2 focus:ring-ring focus:border-input"
                                      value={startTimeInput}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (
                                          value === "" ||
                                          /^\d*\.?\d{0,2}$/.test(value)
                                        ) {
                                          setStartTimeInput(value);
                                        }
                                      }}
                                      onBlur={(e) => {
                                        const value = parseFloat(
                                          e.target.value
                                        );
                                        if (isNaN(value) || value < 0) {
                                          const newValue = "0.00";
                                          setStartTimeInput(newValue);
                                          setStartVidPos(0);
                                        } else if (value >= endVidPos) {
                                          const newValue = Math.max(
                                            0,
                                            endVidPos - 0.01
                                          ).toFixed(2);
                                          setStartTimeInput(newValue);
                                          setStartVidPos(parseFloat(newValue));
                                        } else {
                                          const newValue = value.toFixed(2);
                                          setStartTimeInput(newValue);
                                          setStartVidPos(parseFloat(newValue));
                                        }
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      min={0}
                                      max={videoElement?.duration.toFixed(2)}
                                      step="0.01"
                                      disabled={isConverting}
                                    />
                                  </div>
                                  <button
                                    className="px-3 py-2 border border-input rounded-[var(--radius)] hover:bg-accent disabled:opacity-50 whitespace-nowrap"
                                    onClick={() =>
                                      handleUseCurrentTime("start")
                                    }
                                    disabled={isConverting}
                                    title="Current"
                                  >
                                    ⏱️ Current
                                  </button>
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="flex items-center w-20">
                                    <span className="mr-1">🎬</span>
                                    End Time
                                  </span>
                                  <div className="flex-1">
                                    <input
                                      type="text"
                                      className="w-full px-3 py-2 border rounded-[var(--radius)] focus:ring-2 focus:ring-ring focus:border-input"
                                      value={endTimeInput}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (
                                          value === "" ||
                                          /^\d*\.?\d{0,2}$/.test(value)
                                        ) {
                                          setEndTimeInput(value);
                                        }
                                      }}
                                      onBlur={(e) => {
                                        const maxDuration =
                                          videoElement?.duration || 0;
                                        const value = parseFloat(
                                          e.target.value
                                        );
                                        if (
                                          isNaN(value) ||
                                          value <= startVidPos
                                        ) {
                                          const newValue = Math.min(
                                            startVidPos + 0.01,
                                            maxDuration
                                          ).toFixed(2);
                                          setEndTimeInput(newValue);
                                          setEndVidPos(parseFloat(newValue));
                                        } else if (value > maxDuration) {
                                          const newValue =
                                            maxDuration.toFixed(2);
                                          setEndTimeInput(newValue);
                                          setEndVidPos(maxDuration);
                                        } else {
                                          const newValue = value.toFixed(2);
                                          setEndTimeInput(newValue);
                                          setEndVidPos(parseFloat(newValue));
                                        }
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      min={0}
                                      max={videoElement?.duration.toFixed(2)}
                                      step="0.01"
                                      disabled={isConverting}
                                    />
                                  </div>
                                  <button
                                    className="px-3 py-2 border border-input rounded-[var(--radius)] hover:bg-accent disabled:opacity-50 whitespace-nowrap"
                                    onClick={() => handleUseCurrentTime("end")}
                                    disabled={isConverting}
                                    title="Current"
                                  >
                                    ⏱️ Current
                                  </button>
                                </div>
                              </div>
                            </div>
                          </section>

                          {/* Size Settings */}
                          <section className="space-y-4">
                            <h2 className="text-xl font-medium mb-2">
                              Size Settings
                            </h2>
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="flex items-center w-20">
                                    <span className="mr-1">📏</span>
                                    Width
                                  </span>
                                  <div className="flex-1">
                                    <div className="flex">
                                      <input
                                        type="number"
                                        className="flex-1 px-3 py-2 border rounded-l-[var(--radius)] focus:ring-2 focus:ring-ring focus:border-input"
                                        value={gifWidth}
                                        onChange={(e) =>
                                          handleDimensionChange(
                                            "width",
                                            parseInt(e.target.value)
                                          )
                                        }
                                        min={1}
                                        max={MAX_GIF_DIMENSION}
                                        disabled={isConverting}
                                      />
                                      <span className="inline-flex items-center px-3 py-2 border border-l-0 bg-muted rounded-r-[var(--radius)]">
                                        px
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="flex items-center w-20">
                                    <span className="mr-1">📏</span>
                                    Height
                                  </span>
                                  <div className="flex-1">
                                    <div className="flex">
                                      <input
                                        type="number"
                                        className="flex-1 px-3 py-2 border rounded-l-[var(--radius)] focus:ring-2 focus:ring-ring focus:border-input"
                                        value={gifHeight}
                                        onChange={(e) =>
                                          handleDimensionChange(
                                            "height",
                                            parseInt(e.target.value)
                                          )
                                        }
                                        min={1}
                                        max={MAX_GIF_DIMENSION}
                                        disabled={isConverting}
                                      />
                                      <span className="inline-flex items-center px-3 py-2 border border-l-0 bg-muted rounded-r-[var(--radius)]">
                                        px
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {"Save GIF up to " +
                                  MAX_GIF_DIMENSION +
                                  "x" +
                                  MAX_GIF_DIMENSION +
                                  " pixels"}
                              </div>
                            </div>
                          </section>

                          {/* Quality Settings */}
                          <section className="space-y-4">
                            <h2 className="text-xl font-medium mb-2">
                              Quality Settings
                            </h2>
                            <div>
                              <div className="flex items-center mb-2">
                                <span className="mr-2">🎨 Quality</span>
                                <span className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-[var(--radius)] mr-2">
                                  Best=1
                                </span>
                                <span className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-[var(--radius)]">
                                  Default=10
                                </span>
                              </div>
                              <div className="flex items-center space-x-4">
                                <div className="flex-1">
                                  <input
                                    type="range"
                                    className="w-full accent-primary"
                                    min="1"
                                    max="30"
                                    value={gifQuality}
                                    onChange={(e) =>
                                      setGifQuality(parseInt(e.target.value))
                                    }
                                    disabled={isConverting}
                                  />
                                </div>
                                <div className="w-20">
                                  <input
                                    type="number"
                                    className="w-full px-3 py-1 text-sm border rounded-[var(--radius)] focus:ring-2 focus:ring-ring focus:border-input"
                                    value={gifQuality}
                                    onChange={(e) =>
                                      setGifQuality(parseInt(e.target.value))
                                    }
                                    min="1"
                                    max="30"
                                    disabled={isConverting}
                                  />
                                </div>
                              </div>
                            </div>
                          </section>

                          {/* Convert Button */}
                          <div className="pt-4">
                            <button
                              type="button"
                              onClick={handleConvert}
                              className="w-full px-6 py-3 text-lg bg-primary text-primary-foreground rounded-[var(--radius)] hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={!canConvert}
                              title={
                                !scriptsReady
                                  ? "Waiting for GIF converter to load..."
                                  : !videoElement
                                  ? "Please upload a video first"
                                  : isConverting
                                  ? "Conversion in progress..."
                                  : "Convert to GIF"
                              }
                            >
                              {isConverting ? (
                                <>
                                  <svg
                                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-foreground inline-block"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                  Converting...
                                </>
                              ) : (
                                "Start Converting"
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <canvas ref={canvasRef} className="hidden"></canvas>
    </div>
  );
}

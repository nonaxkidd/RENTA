import { useEffect, useRef } from "react";

declare global {
  interface Window {
    pannellum: any;
  }
}

interface PanoramaViewerProps {
  imageUrl: string;
}

function PanoramaViewer({ imageUrl }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || !window.pannellum) return;

    viewerInstance.current = window.pannellum.viewer(containerRef.current, {
      type: "equirectangular",
      panorama: imageUrl,
      autoLoad: true,
      compass: false,
      showZoomCtrl: true,
    });

    return () => {
      viewerInstance.current?.destroy();
    };
  }, [imageUrl]);

  return <div ref={containerRef} className="panorama-viewer" />;
}

export default PanoramaViewer;
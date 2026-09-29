import { useEffect, useRef } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

interface PanoramaViewerProps {
  /** Equirectangular (360°x180°) source image URL. */
  src: string;
}

/**
 * Frei zieh-/schwenkbarer 360°-Viewer für Fotos mit `is360: true`
 * (Photo Sphere Viewer / three.js - aktiv gepflegtes, gängiges npm-Paket für
 * Web-Equirectangular-Panoramen, Stand Recherche 09/2026, s. Test-Log).
 * Eigene Navbar ist deaktiviert - Zoom per Mausrad/Pinch und Schwenken per
 * Ziehen funktionieren trotzdem (Bibliotheks-Default), unsere App liefert
 * bereits ihr eigenes Overlay (Viewer-Toolbar bzw. Diashow-Leiste).
 */
export function PanoramaViewer({ src }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const viewer = new Viewer({
      container: containerRef.current,
      panorama: src,
      navbar: false,
      defaultZoomLvl: 0,
      loadingTxt: "Lädt 360°-Ansicht…",
    });
    return () => viewer.destroy();
  }, [src]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

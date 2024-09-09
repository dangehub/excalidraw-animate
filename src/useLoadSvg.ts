import { useCallback, useEffect, useState } from "react";
import loadWoff2 from "./wasm/woff2.loader";
import loadHbSubset from "./wasm/hb-subset.loader";
import {
  exportToSvg,
  restoreElements,
  loadLibraryFromBlob,
} from "@excalidraw/excalidraw";

import type { BinaryFiles } from "@excalidraw/excalidraw/types/types";
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/types/element/types";

import { loadScene } from "./vendor/loadScene";
import { animateSvg } from "./animate";

export const getNonDeletedElements = (
  elements: readonly ExcalidrawElement[]
): NonDeletedExcalidrawElement[] =>
  elements.filter(
    (element): element is NonDeletedExcalidrawElement => !element.isDeleted
  );

const importLibraryFromUrl = async (url: string) => {
  try {
    const request = await fetch(url);
    const blob = await request.blob();
    const libraryItems = await loadLibraryFromBlob(blob);
    return libraryItems.map((libraryItem) =>
      getNonDeletedElements(restoreElements(libraryItem.elements, null))
    );
  } catch (error) {
    window.alert("Unable to load library");
    return [];
  }
};

export const useLoadSvg = () => {
  const [loading, setLoading] = useState(true);
  const [loadedSvgList, setLoadedSvgList] = useState<
    {
      svg: SVGSVGElement;
      finishedMs: number;
    }[]
  >([]);

  const loadDataList = useCallback(
    async (
      dataList: {
        elements: readonly ExcalidrawElement[];
        appState: Parameters<typeof exportToSvg>[0]["appState"];
        files: BinaryFiles;
      }[],
      inSequence?: boolean
    ) => {
      const hash = window.location.hash.slice(1);
      const searchParams = new URLSearchParams(hash);
      const options = {
        startMs: undefined as number | undefined,
        pointerImg: searchParams.get("pointerImg") || undefined,
        pointerWidth: searchParams.get("pointerWidth") || undefined,
        pointerHeight: searchParams.get("pointerHeight") || undefined,
      };
      const svgList = await Promise.all(
        dataList.map(async (data) => {
          try {
            const elements = getNonDeletedElements(data.elements);
            const svg = await exportToSvg({
              elements,
              files: data.files,
              appState: data.appState,
              exportPadding: 30,
            });

            console.log("SVG export successful, starting to apply new fonts");
            await applyNewFontsToSvg(svg, elements);

            const result = animateSvg(svg, elements, options);
            console.log("SVG processing completed");
            return { svg, finishedMs: result.finishedMs };
          } catch (error) {
            console.error("Error processing SVG:", error);
            throw error;
          }
        })
      );
      setLoadedSvgList(svgList);
      return svgList;
    },
    []
  );

  useEffect(() => {
    (async () => {
      const hash = window.location.hash.slice(1);
      const searchParams = new URLSearchParams(hash);
      const matchIdKey = /([a-zA-Z0-9_-]+),?([a-zA-Z0-9_-]*)/.exec(
        searchParams.get("json") || ""
      );
      if (matchIdKey) {
        const [, id, key] = matchIdKey;
        const data = await loadScene(id, key, null);
        const [{ svg, finishedMs }] = await loadDataList([data]);
        if (searchParams.get("autoplay") === "no") {
          svg.setCurrentTime(finishedMs);
        }
      }
      const matchLibrary = /(.*\.excalidrawlib)/.exec(
        searchParams.get("library") || ""
      );
      if (matchLibrary) {
        const [, url] = matchLibrary;
        const dataList = await importLibraryFromUrl(url);
        const svgList = await loadDataList(
          dataList.map((elements) => ({ elements, appState: {}, files: {} })),
          searchParams.has("sequence")
        );
        if (searchParams.get("autoplay") === "no") {
          svgList.forEach(({ svg, finishedMs }) => {
            svg.setCurrentTime(finishedMs);
          });
        }
      }
      setLoading(false);
    })();
  }, [loadDataList]);

  return { loading, loadedSvgList, loadDataList };
};

// Change below are to apply new fonts that are not part of current version of Excalidraw package
// Remove them all below once Excalidraw is updated (v0.17.6 as of now)
// ================================================
const DEFAULT_FONT = "Segoe UI Emoji";
/** Up to date version of font family. It's brought from the latest version of Excalidraw repo */
export const FONT_FAMILY = {
  Virgil: 1,
  Helvetica: 2,
  Cascadia: 3,
  LocalFont: 4,
  Excalifont: 5,
  Nunito: 6,
  LilitaOne: 7,
  ComicShanns: 8,
  "Liberation Sans": 9,
} as const;

async function applyNewFontsToSvg(
  svg: SVGSVGElement,
  elements: ExcalidrawElement[]
) {
  console.log("Starting to apply new fonts to SVG");
  const textElements = elements.filter(
    (element): element is ExcalidrawTextElement => element.type === "text"
  );

  const usedFonts = new Map<string, Set<string>>();

  textElements.forEach((element) => {
    const fontName =
      Object.entries(FONT_FAMILY).find(
        ([, value]) => value === element.fontFamily
      )?.[0] || DEFAULT_FONT;

    if (!usedFonts.has(fontName)) {
      usedFonts.set(fontName, new Set());
    }
    element.text.split("").forEach((char) => {
      usedFonts.get(fontName)!.add(char);
    });
  });

  console.log("Used fonts:", Array.from(usedFonts.keys()));

  await Promise.all(
    Array.from(usedFonts.entries()).map(async ([fontName, characters]) => {
      console.log(
        `Processing font: ${fontName}, number of characters: ${characters.size}`
      );
      const fontUrl = new URL(`${process.env.PUBLIC_URL}/${fontName}.woff2`, window.location.origin).href;
      try {
        await embedFontInSvg(svg, fontUrl, fontName, characters);
      } catch (error) {
        console.error(`Error embedding font ${fontName}:`, error);
        // Continue processing the next font
      }
    })
  );

  svg.querySelectorAll("text").forEach((svgText, index) => {
    if (index < textElements.length) {
      const fontFamily = textElements[index].fontFamily;
      convertFontFamily(svgText, fontFamily);
      console.log(
        `Applied font to text element ${index}: ${svgText.getAttribute(
          "font-family"
        )}`
      );
    }
  });

  console.log("New fonts application completed");
}

function convertFontFamily(
  textElement: SVGTextElement,
  fontFamilyNumber: number | undefined
) {
  const fontName =
    Object.entries(FONT_FAMILY).find(
      ([, value]) => value === fontFamilyNumber
    )?.[0] || DEFAULT_FONT;

  textElement.setAttribute("font-family", `${fontName}, ${DEFAULT_FONT}`);
}

async function embedFontInSvg(
  svg: SVGSVGElement,
  fontUrl: string,
  fontFamily: string,
  usedCharacters: Set<string>
) {
  try {
    console.log(`Starting to embed font: ${fontFamily}`);
    console.log(`Font URL: ${fontUrl}`);
    console.log(`Used characters: ${Array.from(usedCharacters).join("")}`);

    const response = await fetch(fontUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    console.log(`Successfully retrieved font file: ${fontFamily}, size: ${arrayBuffer.byteLength} bytes`);

    const { compress, decompress } = await loadWoff2();
    console.log("WOFF2 module loaded successfully");
    const { subset } = await loadHbSubset();
    console.log("HB-subset module loaded successfully");

    let decompressedBinary;
    try {
      decompressedBinary = decompress(arrayBuffer);
      console.log(
        `Font size after decompression: ${decompressedBinary.byteLength} bytes`
      );
    } catch (error) {
      console.error("Font decompression failed:", error);
      throw error;
    }

    if (decompressedBinary.byteLength === 0) {
      throw new Error("Decompressed font data is empty");
    }

    const charCodes = Array.from(usedCharacters).map((char) =>
      char.charCodeAt(0)
    );

    // Add basic Latin character set
    for (let i = 0x0020; i <= 0x007f; i++) {
      charCodes.push(i);
    }

    console.log(
      `Creating font subset, number of characters: ${charCodes.length}`
    );
    let fontSubset;
    try {
      fontSubset = subset(decompressedBinary, new Set(charCodes));
      console.log(
        `Font subset creation completed, size: ${fontSubset.byteLength} bytes`
      );
    } catch (error) {
      console.error("Failed to create font subset:", error);
      // If subset creation fails, use the full font file
      fontSubset = decompressedBinary;
      console.log("Using full font file");
    }

    let compressedBinary;
    try {
      compressedBinary = compress(fontSubset);
      console.log(
        `Font subset size after compression: ${compressedBinary.byteLength} bytes`
      );
    } catch (error) {
      console.error("Font compression failed:", error);
      throw error;
    }

    if (compressedBinary.byteLength === 0) {
      throw new Error("Compressed font data is empty");
    }

    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(compressedBinary))
    );
    console.log(`Base64 encoded font size: ${base64.length} characters`);

    const fontBase64 = `data:font/woff2;base64,${base64}`;

    const style = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "style"
    );
    style.textContent = `
      @font-face {
        font-family: "${fontFamily}";
        src: url("${fontBase64}") format("woff2");
      }
    `;
    svg.insertBefore(style, svg.firstChild);
    console.log(`Font ${fontFamily} successfully embedded in SVG`);
  } catch (error) {
    console.error(`Error embedding font ${fontFamily}:`, error);
    // Add a fallback plan
    const fallbackStyle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "style"
    );
    fallbackStyle.textContent = `
      @font-face {
        font-family: "${fontFamily}";
        src: local("${fontFamily}"), local("${DEFAULT_FONT}");
      }
    `;
    svg.insertBefore(fallbackStyle, svg.firstChild);
    console.log(`Fallback plan added for font ${fontFamily}`);
  }
}

async function exportToSvgWithFonts(data: {
  elements: readonly ExcalidrawElement[];
  appState: Parameters<typeof exportToSvg>[0]["appState"];
  files: BinaryFiles;
}) {
  console.log("Starting exportToSvgWithFonts");
  const elements = getNonDeletedElements(data.elements);
  const svg = await exportToSvg({
    elements,
    files: data.files,
    appState: data.appState,
    exportPadding: 30,
  });

  console.log("SVG exported, applying new fonts");
  await applyNewFontsToSvg(svg, elements);

  // Remove online font references
  const defsElement = svg.querySelector("defs");
  if (defsElement) {
    const styleFonts = defsElement.querySelector(".style-fonts");
    if (styleFonts) {
      defsElement.removeChild(styleFonts);
    }
  }

  // Check the final SVG
  console.log("Final SVG structure:");
  console.log(svg.outerHTML);

  return svg;
}

async function exportSvg(data: {
  elements: readonly ExcalidrawElement[];
  appState: Parameters<typeof exportToSvg>[0]["appState"];
  files: BinaryFiles;
}) {
  console.log("Starting SVG export");
  const svg = await exportToSvgWithFonts(data);
  console.log("SVG exported with fonts, converting to string");
  const svgString = new XMLSerializer().serializeToString(svg);
  console.log("SVG string created, length:", svgString.length);

  // Check font settings in the SVG string
  const fontFamilyMatches = svgString.match(/font-family="[^"]*"/g);
  console.log("Font family occurrences in SVG:", fontFamilyMatches);

  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "excalidraw-export.svg";
  a.click();
  URL.revokeObjectURL(url);
  console.log("SVG export completed");
}

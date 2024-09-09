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

            await applyNewFontsToSvg(svg, elements);

            // 收集使用的字符和字体
            const usedFonts = new Map<string, Set<string>>();
            elements.forEach((el) => {
              if (el.type === "text") {
                const fontName = Object.entries(FONT_FAMILY).find(
                  ([, value]) => value === el.fontFamily
                )?.[0] || DEFAULT_FONT;
                
                if (!usedFonts.has(fontName)) {
                  usedFonts.set(fontName, new Set());
                }
                el.text.split('').forEach(char => {
                  usedFonts.get(fontName)!.add(char);
                });
              }
            });

            // 嵌入使用的字体子集
            for (const [fontName, characters] of usedFonts.entries()) {
              const fontUrl = new URL(`/${fontName}.woff2`, window.location.origin).href;
              console.log("Embedding font:", fontName, "with characters:", Array.from(characters));
              await embedFontInSvg(svg, fontUrl, fontName, characters);
            }

            const result = animateSvg(svg, elements, options);
            console.log("SVG processed successfully");
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
  ChineseFont: 4, // 添加这一行
  Excalifont: 5,
  Nunito: 6,
  "Lilita One": 7,
  "Comic Shanns": 8,
  "Liberation Sans": 9,
} as const;

/**
 * Recursively apply new fonts to all text elements in the given SVG.
 * `exportToSvg()` is not compatible with new fonts due to a discrepancy between package and release excalidraw.
 * This function patches up the fonts resulting in a default font family.
 *
 * issue link: https://github.com/dai-shi/excalidraw-animate/issues/55
 *  */
function applyNewFontsToSvg(svg: SVGSVGElement, elements: ExcalidrawElement[]) {
  const textElements: ExcalidrawTextElement[] = elements.filter(
    (element): element is ExcalidrawTextElement =>
      element.type === "text" && !!element.fontFamily
  ) as ExcalidrawTextElement[];

  /** index to keep track of block of text elements */
  let currentTextElementIndex = 0;

  // Since text element is represented in a group in given svg
  // apply font family based on the group that contains the text elements
  svg.querySelectorAll("g").forEach((svgGroup) => {
    // It indicates the group is not for text - thus skip it
    if (svgGroup.hasAttribute("stroke-linecap")) return;

    const fontFamily = textElements[currentTextElementIndex]?.fontFamily;
    svgGroup.querySelectorAll("text").forEach((svgText) => {
      convertFontFamily(svgText, fontFamily);
      // 添加这行，确保设置 font-family-number 属性
      svgText.setAttribute("font-family-number", fontFamily?.toString() || "");
    });

    currentTextElementIndex += 1;
  });
}

function convertFontFamily(
  textElement: SVGTextElement,
  fontFamilyNumber: number | undefined
) {
  const fontName = Object.entries(FONT_FAMILY).find(
    ([, value]) => value === fontFamilyNumber
  )?.[0];

  if (fontName) {
    textElement.setAttribute("font-family", `${fontName}, ${DEFAULT_FONT}`);
  } else {
    textElement.setAttribute("font-family", DEFAULT_FONT);
  }
}

async function embedFontInSvg(svg: SVGSVGElement, fontUrl: string, fontFamily: string, usedCharacters: Set<string>) {
  try {
    const response = await fetch(fontUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    const { compress, decompress } = await loadWoff2();
    const { subset } = await loadHbSubset();

    const decompressedBinary = decompress(arrayBuffer);
    
    // 创建字符集
    const charCodes = Array.from(usedCharacters).map(char => char.charCodeAt(0));

    const fontSubset = subset(decompressedBinary, new Set(charCodes));
    const compressedBinary = compress(fontSubset);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(compressedBinary)));
    const fontBase64 = `data:font/woff2;base64,${base64}`;

    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      @font-face {
        font-family: "${fontFamily}";
        src: url("${fontBase64}") format("woff2");
      }
    `;
    svg.insertBefore(style, svg.firstChild);
    console.log("Font embedded successfully:", fontFamily);
  } catch (error) {
    console.error("Error embedding font:", error);
    // 回退方案
    const fallbackStyle = document.createElementNS("http://www.w3.org/2000/svg", "style");
    fallbackStyle.textContent = `
      @font-face {
        font-family: "${fontFamily}";
        src: local("${fontFamily}"), local("Arial");
      }
    `;
    svg.insertBefore(fallbackStyle, svg.firstChild);
  }
}


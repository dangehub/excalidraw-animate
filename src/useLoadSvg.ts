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

            applyNewFontsToSvg(svg, elements);

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
              await embedFontInSvg(svg, fontUrl, fontName, characters);
            }

            // 再次应用字体，以确保嵌入后的字体被正确应用
            applyNewFontsToSvg(svg, elements);

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
  const textElements = elements.filter(
    (element): element is ExcalidrawTextElement => element.type === "text"
  );

  svg.querySelectorAll("text").forEach((svgText, index) => {
    if (index < textElements.length) {
      const fontFamily = textElements[index].fontFamily;
      convertFontFamily(svgText, fontFamily);
      svgText.setAttribute("font-family-number", fontFamily?.toString() || "");

      console.log(`Applied font to element ${index}:`, svgText.getAttribute("font-family"));
    }
  });

  // 检查最后一个元素
  const lastText = svg.querySelector("text:last-of-type");
  if (lastText) {
    console.log("Last text element font-family:", lastText.getAttribute("font-family"));
    console.log("Last text element font-family-number:", lastText.getAttribute("font-family-number"));
  }

}

function convertFontFamily(
  textElement: SVGTextElement,
  fontFamily: number | undefined
) {
  const fontName = Object.entries(FONT_FAMILY).find(
    ([, value]) => value === fontFamily
  )?.[0];

  if (fontName) {
    textElement.setAttribute("font-family", `${fontName}, ChineseFont, ${DEFAULT_FONT}`);
  } else {
    textElement.setAttribute("font-family", `ChineseFont, ${DEFAULT_FONT}`);
  }
}

const BATCH_SIZE = 1000; // 每批处理的字符数

async function processCharacters(decompressedBinary: ArrayBuffer, charCodes: number[], subset: any, compress: any) {
  let fontSubset = decompressedBinary;
  for (let i = 0; i < charCodes.length; i += BATCH_SIZE) {
    const batch = charCodes.slice(i, i + BATCH_SIZE);
    fontSubset = subset(fontSubset, new Set(batch));
    console.log(`Font processing progress: ${Math.round((i + BATCH_SIZE) / charCodes.length * 100)}%`);
  }
  return compress(fontSubset);
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
    
    const charCodes = Array.from(new Set(Array.from(usedCharacters).map(char => char.charCodeAt(0))));
    
    // 添加基本拉丁字符集和中文字符集
    for (let i = 0x0020; i <= 0x007F; i++) {
      charCodes.push(i);
    }
    // 添加常用中文字符集（简体）
    for (let i = 0x4E00; i <= 0x9FFF; i++) {
      charCodes.push(i);
    }

    console.log(`Processing ${charCodes.length} characters for ${fontFamily}`);
    const compressedBinary = await processCharacters(decompressedBinary, charCodes, subset, compress);
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
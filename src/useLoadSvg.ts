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
            const fontUrl = new URL('/chinese.woff2', window.location.origin).href;
            await embedFontInSvg(svg, fontUrl, "ChineseFont");

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
    });

    currentTextElementIndex += 1;
  });

  // 确保ChineseFont被正确嵌入
  const fontUrl = new URL('/chinese.woff2', window.location.origin).href;
  return embedFontInSvg(svg, fontUrl, "ChineseFont");
}

function convertFontFamily(
  textElement: SVGTextElement,
  fontFamilyNumber: number | undefined
) {
  switch (fontFamilyNumber) {
    case FONT_FAMILY.Virgil:
      textElement.setAttribute("font-family", `Virgil, ${DEFAULT_FONT}`);
      break;

    case FONT_FAMILY.Helvetica:
      textElement.setAttribute("font-family", `Helvetica, ${DEFAULT_FONT}`);
      break;

    case FONT_FAMILY.Cascadia:
      textElement.setAttribute("font-family", `Cascadia, ${DEFAULT_FONT}`);
      break;

    case FONT_FAMILY.Excalifont:
      textElement.setAttribute("font-family", `Excalifont, ${DEFAULT_FONT}`);
      break;

    case FONT_FAMILY.Nunito:
      textElement.setAttribute("font-family", `Nunito, ${DEFAULT_FONT}`);
      break;

    case FONT_FAMILY["Lilita One"]:
      textElement.setAttribute("font-family", `Lilita One, ${DEFAULT_FONT}`);
      break;

    case FONT_FAMILY["Comic Shanns"]:
      textElement.setAttribute("font-family", `Comic Shanns, ${DEFAULT_FONT}`);
      break;

    case FONT_FAMILY["Liberation Sans"]:
      textElement.setAttribute(
        "font-family",
        `Liberation Sans, ${DEFAULT_FONT}`
      );
      break;

    case FONT_FAMILY.ChineseFont:
      textElement.setAttribute("font-family", `ChineseFont, ${DEFAULT_FONT}`);
      break;

    default:
      // 如果文本包含中文字符,使用ChineseFont
      if (/[\u4e00-\u9fa5]/.test(textElement.textContent || '')) {
        textElement.setAttribute("font-family", `ChineseFont, ${DEFAULT_FONT}`);
      } else {
        textElement.setAttribute("font-family", DEFAULT_FONT);
      }
      break;
  }
}

async function embedFontInSvg(svg: SVGSVGElement, fontUrl: string, fontFamily: string) {
  try {
    const response = await fetch(fontUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    const { compress, decompress } = await loadWoff2();
    const { subset } = await loadHbSubset();

    const decompressedBinary = decompress(arrayBuffer);
    
    // 使用更小的字符集
    const commonChineseCharacters = [
      // 添加常用的中文字符的 Unicode 码点
      0x4e00, 0x4e8c, 0x4e09, 0x56db, 0x4e94, 0x516d, 0x4e03, 0x516b, 0x4e5d, 0x5341,
      // ... 添加更多常用字符
    ];
    const limitedCodePoints = new Set([
      ...Array(128).map((_, i) => i), // 基本 ASCII 字符
      ...commonChineseCharacters
    ]);

    const subsetSnft = subset(decompressedBinary, limitedCodePoints);
    const compressedBinary = compress(subsetSnft);

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
    // 在这里添加一个回退方案，例如使用系统默认字体
    const fallbackStyle = document.createElementNS("http://www.w3.org/2000/svg", "style");
    fallbackStyle.textContent = `
      @font-face {
        font-family: "${fontFamily}";
        src: local("SimSun"), local("Microsoft YaHei");
      }
    `;
    svg.insertBefore(fallbackStyle, svg.firstChild);
  }
}


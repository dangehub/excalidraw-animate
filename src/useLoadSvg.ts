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

            console.log('SVG 导出成功，开始应用新字体');
            await applyNewFontsToSvg(svg, elements);

            const result = animateSvg(svg, elements, options);
            console.log("SVG 处理成功完成");
            return { svg, finishedMs: result.finishedMs };
          } catch (error) {
            console.error("处理 SVG 时出错:", error);
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
  ChineseFont: 4,
  Excalifont: 5,
  Nunito: 6,
  "LilitaOne": 7,
  "ComicShanns": 8,
  "Liberation Sans": 9,
} as const;

async function applyNewFontsToSvg(svg: SVGSVGElement, elements: ExcalidrawElement[]) {
  console.log('开始应用新字体到 SVG');
  const textElements = elements.filter(
    (element): element is ExcalidrawTextElement => element.type === "text"
  );

  const usedFonts = new Map<string, Set<string>>();

  textElements.forEach((element) => {
    const fontName = Object.entries(FONT_FAMILY).find(
      ([, value]) => value === element.fontFamily
    )?.[0] || DEFAULT_FONT;

    if (!usedFonts.has(fontName)) {
      usedFonts.set(fontName, new Set());
    }
    element.text.split('').forEach(char => {
      usedFonts.get(fontName)!.add(char);
    });
  });

  console.log('使用的字体:', Array.from(usedFonts.keys()));

  await Promise.all(Array.from(usedFonts.entries()).map(async ([fontName, characters]) => {
    console.log(`处理字体: ${fontName}, 字符数: ${characters.size}`);
    const fontUrl = new URL(`/${fontName}.woff2`, window.location.origin).href;
    try {
      await embedFontInSvg(svg, fontUrl, fontName, characters);
    } catch (error) {
      console.error(`嵌入字体 ${fontName} 失败:`, error);
      // 继续处理下一个字体
    }
  }));

  svg.querySelectorAll("text").forEach((svgText, index) => {
    if (index < textElements.length) {
      const fontFamily = textElements[index].fontFamily;
      convertFontFamily(svgText, fontFamily);
      console.log(`应用字体到文本元素 ${index}: ${svgText.getAttribute('font-family')}`);
    }
  });

  console.log('新字体应用完成');
}

function convertFontFamily(
  textElement: SVGTextElement,
  fontFamilyNumber: number | undefined
) {
  const fontName = Object.entries(FONT_FAMILY).find(
    ([, value]) => value === fontFamilyNumber
  )?.[0] || DEFAULT_FONT;

  textElement.setAttribute("font-family", `${fontName}, ${DEFAULT_FONT}`);
}

async function embedFontInSvg(svg: SVGSVGElement, fontUrl: string, fontFamily: string, usedCharacters: Set<string>) {
  try {
    console.log(`开始嵌入字体: ${fontFamily}`);
    console.log(`使用的字符: ${Array.from(usedCharacters).join('')}`);

    const response = await fetch(fontUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    console.log(`成功获取字体文件: ${fontFamily}, 大小: ${arrayBuffer.byteLength} 字节`);

    const { compress, decompress } = await loadWoff2();
    console.log("WOFF2 模块加载成功");
    const { subset } = await loadHbSubset();
    console.log("HB-subset 模块加载成功");

    let decompressedBinary;
    try {
      decompressedBinary = decompress(arrayBuffer);
      console.log(`字体解压缩后大小: ${decompressedBinary.byteLength} 字节`);
    } catch (error) {
      console.error("字体解压缩失败:", error);
      throw error;
    }

    if (decompressedBinary.byteLength === 0) {
      throw new Error("解压缩后的字体数据为空");
    }

    const charCodes = Array.from(usedCharacters).map(char => char.charCodeAt(0));
    
    // 添加基本拉丁字符集
    for (let i = 0x0020; i <= 0x007F; i++) {
      charCodes.push(i);
    }

    console.log(`正在创建字体子集，字符数: ${charCodes.length}`);
    let fontSubset;
    try {
      fontSubset = subset(decompressedBinary, new Set(charCodes));
      console.log(`字体子集创建完成，大小: ${fontSubset.byteLength} 字节`);
    } catch (error) {
      console.error("创建字体子集失败:", error);
      // 如果创建子集失败，使用完整的字体文件
      fontSubset = decompressedBinary;
      console.log("使用完整字体文件");
    }

    let compressedBinary;
    try {
      compressedBinary = compress(fontSubset);
      console.log(`字体子集压缩后大小: ${compressedBinary.byteLength} 字节`);
    } catch (error) {
      console.error("字体压缩失败:", error);
      throw error;
    }

    if (compressedBinary.byteLength === 0) {
      throw new Error("压缩后的字体数据为空");
    }

    const base64 = btoa(String.fromCharCode(...new Uint8Array(compressedBinary)));
    console.log(`Base64 编码后的字体大小: ${base64.length} 字符`);

    const fontBase64 = `data:font/woff2;base64,${base64}`;

    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      @font-face {
        font-family: "${fontFamily}";
        src: url("${fontBase64}") format("woff2");
      }
    `;
    svg.insertBefore(style, svg.firstChild);
    console.log(`字体 ${fontFamily} 成功嵌入 SVG`);
  } catch (error) {
    console.error(`嵌入字体 ${fontFamily} 时出错:`, error);
    // 添加一个回退方案
    const fallbackStyle = document.createElementNS("http://www.w3.org/2000/svg", "style");
    fallbackStyle.textContent = `
      @font-face {
        font-family: "${fontFamily}";
        src: local("${fontFamily}"), local("${DEFAULT_FONT}");
      }
    `;
    svg.insertBefore(fallbackStyle, svg.firstChild);
    console.log(`已为字体 ${fontFamily} 添加回退方案`);
  }
}

async function exportToSvgWithFonts(
  data: {
    elements: readonly ExcalidrawElement[];
    appState: Parameters<typeof exportToSvg>[0]["appState"];
    files: BinaryFiles;
  }
) {
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

  // 移除在线字体引用
  const defsElement = svg.querySelector("defs");
  if (defsElement) {
    const styleFonts = defsElement.querySelector(".style-fonts");
    if (styleFonts) {
      defsElement.removeChild(styleFonts);
    }
  }

  // 检查最终的 SVG
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
  
  // 检查 SVG 字符串中的字体设置
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
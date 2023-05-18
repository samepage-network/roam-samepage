import loadSharePageWithNotebook from "samepage/protocols/sharePageWithNotebook";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getPageTitleValueByHtmlElement from "roamjs-components/dom/getPageTitleValueByHtmlElement";
import elToTitle from "roamjs-components/dom/elToTitle";
import getUids from "roamjs-components/dom/getUids";
import createPage from "roamjs-components/writes/createPage";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import openBlockInSidebar from "roamjs-components/writes/openBlockInSidebar";
import nanoid from "nanoid";
import getParentUidsOfBlockUid from "roamjs-components/queries/getParentUidsOfBlockUid";
import { has as isShared } from "samepage/utils/localAutomergeDb";
import decodeState from "../utils/decodeState";
import isPage from "../utils/isPage";
import encodeState from "../utils/encodeState";
import atJsonToRoam from "../utils/atJsonToRoam";
import isBlock from "src/utils/isBlock";
import isPageUid from "src/utils/isPageUid";
import createHTMLObserver from "samepage/utils/createHTMLObserver";

// import sha256 from "crypto-js/sha256";

// const hashes: Record<number, string> = {};
// const hashFn = (s: string) => sha256(s).toString();

// Roam notebookPageId could be either:
// - a page title
// - a page uid
// - a block uid
const setupSharePageWithNotebook = () => {
  const { unload, refreshContent } = loadSharePageWithNotebook({
    getCurrentNotebookPageId: () =>
      window.roamAlphaAPI.ui.mainWindow
        .getOpenPageOrBlockUid()
        .then(
          (uid) => uid || window.roamAlphaAPI.util.dateToPageUid(new Date())
        ),
    ensurePageByTitle: async (title) => {
      const pageTitle = atJsonToRoam(title);
      const existingNotebookPageId = window.roamAlphaAPI.pull("[:block/uid]", [
        ":node/title",
        pageTitle,
      ])?.[":block/uid"];
      if (existingNotebookPageId) {
        return { notebookPageId: existingNotebookPageId, preExisting: true };
      }
      // TODO - support for giving the user the option to confirm equivalent block as title
      // TODO - support for creating either a page or a block
      return createPage({ title: pageTitle });
    },
    openPage: async (notebookPageId) => {
      if (isPage(notebookPageId))
        await window.roamAlphaAPI.ui.mainWindow.openPage({
          page: { title: notebookPageId },
        });
      else if (isPageUid(notebookPageId))
        await window.roamAlphaAPI.ui.mainWindow.openPage({
          page: { uid: notebookPageId },
        });
      else if (isBlock(notebookPageId))
        await window.roamAlphaAPI.ui.mainWindow.openBlock({
          block: { uid: notebookPageId },
        });
      return notebookPageId;
    },
    deletePage: (title) =>
      window.roamAlphaAPI.deletePage({
        page: { title },
      }),
    decodeState,
    encodeState,
    overlayProps: {
      viewSharedPageProps: {
        onLinkClick: (notebookPageId, e) => {
          if (e.shiftKey) {
            openBlockInSidebar(getPageUidByPageTitle(notebookPageId));
          } else {
            window.roamAlphaAPI.ui.mainWindow.openPage({
              page: { title: notebookPageId },
            });
          }
        },
        linkClassName: "rm-page-ref",
        linkNewPage: (_, title) => createPage({ title }),
      },
      sharedPageStatusProps: {
        getPaths: (notebookPageId) => {
          const pageTitle = isPage(notebookPageId)
            ? notebookPageId
            : isPageUid(notebookPageId)
            ? getPageTitleByPageUid(notebookPageId)
            : null;
          return (
            pageTitle
              ? Array.from(
                  document.querySelectorAll<HTMLHeadingElement>(
                    "h1.rm-title-display"
                  )
                ).filter((h) => getPageTitleValueByHtmlElement(h) === pageTitle)
              : Array.from(
                  document.querySelectorAll<
                    HTMLDivElement | HTMLTextAreaElement
                  >(
                    `div[id*="${notebookPageId}"],textarea[id*="${notebookPageId}"]`
                  )
                )
                  .map((e) =>
                    e
                      .closest(".roam-article")
                      ?.querySelector<HTMLDivElement>(".zoom-path-view")
                  )
                  .filter((e) => !!e)
          ).map((el) => {
            if (el.nodeName === "H1") {
              const parent = el?.parentElement?.parentElement;
              const sel = nanoid();
              parent.setAttribute("data-samepage-shared", sel);
              return `div[data-samepage-shared="${sel}"]::before(1)`;
            } else {
              const parent = el.parentElement;
              const sel = nanoid();
              parent.setAttribute("data-samepage-shared", sel);
              return `div[data-samepage-shared="${sel}"]::before(1)`;
            }
          });
        },
        observer: ({ onload, onunload }) => {
          const observer = createHTMLObserver({
            selector:
              "h1.rm-title-display, div.roam-article div.zoom-path-view",
            callback: (el) => {
              if (el.nodeName === "H1") {
                const title = elToTitle(el as Element);
                onload(getPageUidByPageTitle(title));
                onload(title);
              } else if (el.nodeName === "DIV") {
                const blockUid = getUids(
                  el.parentElement.querySelector(
                    "div.roam-block, textarea.rm-block-input"
                  )
                )?.blockUid;
                onload(blockUid);
              }
            },
            onRemove: (el) => {
              if (el.nodeName === "H1") {
                const title = elToTitle(el as Element);
                onunload(getPageUidByPageTitle(title));
                onunload(title);
              } else if (el.nodeName === "DIV") {
                const blockUid = getUids(
                  el.parentElement.querySelector(
                    "div.roam-block, textarea.rm-block-input"
                  )
                )?.blockUid;
                onunload(blockUid);
              }
            },
          });
          return () => observer.disconnect();
        },
        getNotebookPageId: async (el) =>
          el.nodeName === "H1"
            ? elToTitle(el as Element)
            : getUids(
                el.parentElement.querySelector(
                  "div.roam-block, textarea.rm-block-input"
                )
              ).blockUid,
      },
    },
    onConnect: () => {
      let refreshRef:
        | Parameters<typeof window.roamAlphaAPI.data.addPullWatch>
        | undefined;
      const clearRefreshRef = () => {
        if (refreshRef) {
          window.roamAlphaAPI.data.removePullWatch(...refreshRef);
          refreshRef = undefined;
        }
      };
      const refreshState = ({
        label,
        blockUid,
        notebookPageId,
        pull = "[*]",
      }: {
        label: string;
        blockUid: string;
        notebookPageId: string;
        pull?: string;
      }) => {
        refreshRef = [
          pull,
          `[:block/uid "${blockUid}"]`,
          async () => {
            clearRefreshRef();
            refreshContent({ notebookPageId, label });
          },
        ];
        window.roamAlphaAPI.data.addPullWatch(...refreshRef);
      };

      const forEachNotebookPageId = ({
        blockUid,
        callback,
      }: {
        blockUid: string;
        callback: (notebookPageId: string) => void;
      }) => {
        const notebookPageIds = getParentUidsOfBlockUid(blockUid);
        notebookPageIds
          .concat(getPageTitleByPageUid(notebookPageIds[0]))
          .forEach((n) => {
            isShared(n).then((s) => s && callback(n));
          });
      };

      const bodyKeydownListener = (e: KeyboardEvent) => {
        const el = e.target as HTMLElement;
        if (/^.$/.test(e.key) && e.metaKey) return;
        if (/^Arrow/.test(e.key) && !(e.shiftKey && (e.metaKey || e.altKey)))
          return;
        if (/^Shift/.test(e.key)) return;
        if (/^Alt/.test(e.key)) return;
        if (/^Escape/.test(e.key)) return;
        if (
          el.tagName === "TEXTAREA" &&
          el.classList.contains("rm-block-input")
        ) {
          const { blockUid } = getUids(el as HTMLTextAreaElement);
          forEachNotebookPageId({
            blockUid,
            callback(notebookPageId) {
              clearRefreshRef();
              refreshState({
                label: `Key Presses - ${e.key}`,
                blockUid,
                notebookPageId,
                pull: "[:block/string :block/parents :block/order]",
              });
            },
          });
        }
      };
      document.body.addEventListener("keydown", bodyKeydownListener);

      const bodyPasteListener = (e: ClipboardEvent) => {
        const el = e.target as HTMLElement;
        if (
          el.tagName === "TEXTAREA" &&
          el.classList.contains("rm-block-input")
        ) {
          const { blockUid } = getUids(el as HTMLTextAreaElement);
          forEachNotebookPageId({
            blockUid,
            callback(notebookPageId) {
              clearRefreshRef();
              refreshState({
                blockUid,
                notebookPageId,
                pull: "[:block/string]",
                label: "Paste",
              });
            },
          });
        }
      };
      document.body.addEventListener("paste", bodyPasteListener);

      const dragEndListener = (e: DragEvent) => {
        const el = e.target as HTMLElement;
        if (el.tagName === "SPAN" && el.classList.contains("rm-bullet")) {
          const { blockUid } = getUids(
            el
              .closest(".rm-block-main")
              .querySelector(".roam-block, .rm-block-text")
          );
          if (blockUid) {
            forEachNotebookPageId({
              blockUid,
              callback(notebookPageId) {
                clearRefreshRef();
                refreshState({ blockUid, notebookPageId, label: "Drag Block" });
              },
            });
          }
        }
      };
      document.body.addEventListener("dragend", dragEndListener);
      return () => {
        clearRefreshRef();
        document.body.removeEventListener("keydown", bodyKeydownListener);
        document.body.removeEventListener("paste", bodyPasteListener);
        document.body.removeEventListener("dragend", dragEndListener);
      };
    },
  });

  return unload;
};

export default setupSharePageWithNotebook;

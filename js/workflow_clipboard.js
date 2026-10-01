import { app } from "../../scripts/app.js";

const EXTENSION_NAME = "workflow.clipboard";

function toast(severity, summary, detail) {
    try {
        app.extensionManager?.toast?.add({
            severity,
            summary,
            detail,
            life: severity === "error" ? 5000 : 2200,
        });
    } catch (_) {
        // Toasts are convenience only; clipboard functionality should still work.
    }
}

async function writeTextToClipboard(text) {
    // Preferred path in ComfyUI Desktop / modern browsers.
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            console.warn("[Workflow Clipboard] navigator.clipboard failed; trying fallback.", error);
        }
    }

    // Fallback for environments where the async Clipboard API is unavailable/blocked.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);

    try {
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const ok = document.execCommand("copy");
        if (!ok) throw new Error("document.execCommand('copy') returned false");
    } finally {
        textarea.remove();
    }
}

function addViewRestoreIfEnabled(workflow) {
    try {
        const enabled = app.extensionManager?.setting?.get?.("Comfy.EnableWorkflowViewRestore");
        if (!enabled || !app.canvas?.ds) return;

        const { offset, scale } = app.canvas.ds;
        workflow.extra ??= {};
        workflow.extra.ds = {
            scale,
            offset: [offset[0], offset[1]],
        };
    } catch (error) {
        console.warn("[Workflow Clipboard] Could not add view restore state.", error);
    }
}

async function buildCurrentPrompt() {
    if (typeof app.graphToPrompt !== "function") {
        throw new Error("ComfyUI app.graphToPrompt() is unavailable in this frontend version.");
    }
    return await app.graphToPrompt();
}

async function copyWorkflowJson() {
    try {
        const prompt = await buildCurrentPrompt();
        if (!prompt?.workflow) throw new Error("ComfyUI returned no workflow payload.");

        addViewRestoreIfEnabled(prompt.workflow);
        const json = JSON.stringify(prompt.workflow, null, 2);
        await writeTextToClipboard(json);

        toast("success", "Workflow copied", `${json.length.toLocaleString()} characters copied to clipboard.`);
    } catch (error) {
        console.error("[Workflow Clipboard] Failed to copy workflow JSON:", error);
        toast("error", "Copy failed", error?.message ?? String(error));
    }
}

async function copyApiJson() {
    try {
        const prompt = await buildCurrentPrompt();
        if (!prompt?.output) throw new Error("ComfyUI returned no API payload.");

        const json = JSON.stringify(prompt.output, null, 2);
        await writeTextToClipboard(json);

        toast("success", "API JSON copied", `${json.length.toLocaleString()} characters copied to clipboard.`);
    } catch (error) {
        console.error("[Workflow Clipboard] Failed to copy API JSON:", error);
        toast("error", "Copy failed", error?.message ?? String(error));
    }
}

app.registerExtension({
    name: EXTENSION_NAME,

    commands: [
        {
            id: "workflow.clipboard.copyWorkflowJson",
            label: "Copy Workflow JSON",
            icon: "pi pi-copy",
            function: copyWorkflowJson,
        },
        {
            id: "workflow.clipboard.copyApiJson",
            label: "Copy API JSON",
            icon: "pi pi-code",
            function: copyApiJson,
        },
    ],

    menuCommands: [
        {
            path: ["Workflow Clipboard"],
            commands: [
                "workflow.clipboard.copyWorkflowJson",
                "workflow.clipboard.copyApiJson",
            ],
        },
    ],

    // One-click button for the common case. The API JSON remains available in the menu.
    actionBarButtons: [
        {
            icon: "pi pi-copy",
            tooltip: "Copy current workflow JSON to clipboard",
            onClick: copyWorkflowJson,
        },
    ],
});

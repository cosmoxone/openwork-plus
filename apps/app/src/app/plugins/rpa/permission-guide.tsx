import { createSignal, onMount, Show, For } from "solid-js";
import { fetchRpaStatus } from "./rpa-api";

type PermissionItem = {
  id: string;
  title: string;
  steps: string[];
};

function itemsForPlatform(platform: string): PermissionItem[] {
  if (platform === "darwin") {
    return [
      {
        id: "screen-recording",
        title: "屏幕录制（Screenshot / 截图）",
        steps: [
          "打开 系统设置 › 隐私与安全性 › 屏幕录制",
          "启用 OpenWork Plus（或运行 gui-operate MCP 的终端 / Node 进程）",
          "若已启用仍失败，退出并重启 OpenWork Plus 后再试",
        ],
      },
      {
        id: "accessibility",
        title: "辅助功能（Click / Type / 点击输入）",
        steps: [
          "打开 系统设置 › 隐私与安全性 › 辅助功能",
          "启用 OpenWork Plus 与 Terminal（若 MCP 由 CLI 启动）",
          "首次 click/type 若返回 permission 或 access denied，按上述勾选后重试",
        ],
      },
    ];
  }
  if (platform === "win32") {
    return [
      {
        id: "screen-capture",
        title: "屏幕捕获",
        steps: [
          "Windows 11：设置 › 隐私和安全性 › 屏幕截图（如系统提示则允许桌面应用）",
          "确认安全软件未拦截 OpenWork Plus 或 gui-operate MCP 的屏幕访问",
        ],
      },
      {
        id: "wsl-sandbox",
        title: "WSL2 沙箱 CLI（可选）",
        steps: [
          "安装 WSL2 + Ubuntu；运行 computer-use bundle 的 sandbox 初始化",
          "CLI：`node packages/sandbox-bootstrap/bin/sandbox-bootstrap.mjs exec -- echo ok`",
        ],
      },
    ];
  }
  return [
    {
      id: "display",
      title: "显示与输入",
      steps: [
        "确保当前用户对 DISPLAY / Wayland 会话有截图权限",
        "headless 环境请使用带虚拟 framebuffer 的沙箱",
      ],
    },
  ];
}

export default function PermissionGuide() {
  const [platform, setPlatform] = createSignal("unknown");
  const [expanded, setExpanded] = createSignal(true);

  onMount(() => {
    void (async () => {
      try {
        const status = await fetchRpaStatus();
        setPlatform(status.platform || "unknown");
      } catch {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        if (/Win/i.test(ua)) setPlatform("win32");
        else if (/Mac/i.test(ua)) setPlatform("darwin");
        else if (/Linux/i.test(ua)) setPlatform("linux");
        else setPlatform("unknown");
      }
    })();
  });

  const items = () => itemsForPlatform(platform());

  return (
    <section
      class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
      data-testid="rpa-permission-guide"
    >
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="text-sm font-medium text-dls-text">系统权限引导</h2>
          <p class="mt-1 text-xs text-dls-secondary">
            GUI 自动化需要 OS 权限。若 MCP <code class="font-mono">screenshot</code> /{" "}
            <code class="font-mono">click</code> 返回 permission 或 access denied，请按下列步骤授权（
            {platform()}）。
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 text-xs text-dls-secondary underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded() ? "收起" : "展开"}
        </button>
      </div>

      <Show when={expanded()}>
        <ul class="mt-3 space-y-3">
          <For each={items()}>
            {(item) => (
              <li class="rounded-lg border border-dls-border bg-dls-surface p-3">
                <h3 class="text-xs font-medium text-dls-text" data-testid={`rpa-permission-${item.id}`}>
                  {item.title}
                </h3>
                <ol class="mt-2 list-decimal space-y-1 pl-4 text-xs text-dls-secondary">
                  <For each={item.steps}>{(step) => <li>{step}</li>}</For>
                </ol>
              </li>
            )}
          </For>
        </ul>
        <p class="mt-3 text-xs text-dls-secondary">
          日志路径：<code class="font-mono">logs/gui-operate/operations.ndjson</code> 与 MCP 文本日志；错误信息应含
          permission / access denied 等关键词。
        </p>
      </Show>
    </section>
  );
}

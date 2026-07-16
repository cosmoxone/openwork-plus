"use client";

import { useEffect, useState } from "react";
import { getErrorMessage, requestJson } from "../_lib/den-flow";
import { isMobileUserAgent } from "../_lib/platform";

const OPENWORK_DOWNLOAD_URL = "https://openworklabs.com/download";

const capabilities = [
  {
    title: "Edit spreadsheets",
    description: "Create, clean, and transform CSV and Excel files.",
  },
  {
    title: "Control your browser",
    description: "Automate the built-in browser for repetitive web tasks.",
  },
  {
    title: "Organize files",
    description: "Read, write, and manage files and folders.",
  },
  {
    title: "Automate tasks",
    description: "Build reusable workflows with skills and commands.",
  },
  {
    title: "Generate content",
    description: "Draft documents, emails, and reports.",
  },
  {
    title: "Connect to APIs",
    description: "Plug into external services and tools via MCP.",
  },
];

type JoinOrgSuccessProps = {
  organizationName: string;
  onContinueInBrowser: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOpenworkUrl(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const url = payload.openworkUrl;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

export function JoinOrgSuccess({ organizationName, onContinueInBrowser }: JoinOrgSuccessProps) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffAttempted, setHandoffAttempted] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setIsMobile(isMobileUserAgent());
  }, []);

  async function createDesktopHandoff() {
    const { response, payload } = await requestJson(
      "/v1/auth/desktop-handoff",
      {
        method: "POST",
        body: JSON.stringify({ desktopScheme: "openwork" }),
      },
      12000,
    );

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, `Could not prepare a desktop sign-in link (${response.status}).`));
    }

    const openworkUrl = getOpenworkUrl(payload);
    if (!openworkUrl) {
      throw new Error("Desktop sign-in succeeded, but no app link was returned.");
    }

    return openworkUrl;
  }

  async function handleOpenOpenWork() {
    setHandoffBusy(true);
    setHandoffAttempted(true);
    setActionError(null);

    try {
      window.location.assign(await createDesktopHandoff());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not open OpenWork.");
    } finally {
      setHandoffBusy(false);
    }
  }

  async function handleCopySignInLink() {
    setCopyBusy(true);
    setCopied(false);
    setActionError(null);

    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard is not available in this browser.");
      }
      await navigator.clipboard.writeText(await createDesktopHandoff());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not copy the sign-in link.");
    } finally {
      setCopyBusy(false);
    }
  }

  async function handleEmailDownload() {
    setEmailBusy(true);
    setActionError(null);

    try {
      const { response, payload } = await requestJson("/v1/me/send-download-link", { method: "POST" }, 12000);
      if (!response.ok) {
        setActionError(getErrorMessage(payload, `Could not send the download link (${response.status}).`));
        return;
      }
      setEmailSent(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not send the download link.");
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <section className="den-page py-4 lg:py-6" data-testid="join-org-success">
      <div className="den-frame grid max-w-[48rem] gap-6 p-6 md:p-8">
        <div className="grid gap-2">
          <p className="den-eyebrow">OpenWork Cloud</p>
          <h1 className="den-title-xl max-w-[16ch]">You&apos;re in, welcome to {organizationName}</h1>
          <p className="den-copy">The desktop app is where OpenWork runs on your computer and puts your team&apos;s setup to work.</p>
        </div>

        {isMobile === null ? (
          <p className="den-copy">Preparing your next step...</p>
        ) : isMobile ? (
          <div className="grid gap-5">
            <div className="den-frame-inset grid gap-2 rounded-[1.5rem] p-5" data-testid="join-org-mobile-note">
              <p className="m-0 text-base font-medium text-[var(--dls-text-primary)]">OpenWork runs on your computer.</p>
              <p className="den-copy">You&apos;re in — next time you&apos;re at your computer, download the desktop app to put your team to work.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="den-button-primary w-full sm:w-auto"
                onClick={() => void handleEmailDownload()}
                disabled={emailBusy || emailSent}
                data-testid="join-org-email-download"
              >
                {emailBusy ? "Sending..." : emailSent ? "Sent" : "Email me the download link"}
              </button>
            </div>
            {emailSent ? <div className="den-notice is-info">Sent — check your inbox when you&apos;re back at your desk.</div> : null}
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {capabilities.map((capability) => (
                <div key={capability.title} className="den-frame-inset rounded-[1.25rem] p-4">
                  <p className="m-0 text-sm font-medium text-[var(--dls-text-primary)]">{capability.title}</p>
                  <p className="m-0 mt-1 text-xs leading-snug text-[var(--dls-text-secondary)]">{capability.description}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="den-button-primary w-full sm:w-auto"
                onClick={() => void handleOpenOpenWork()}
                disabled={handoffBusy}
                data-testid="join-org-open-openwork"
              >
                {handoffBusy ? "Opening OpenWork..." : "Open OpenWork"}
              </button>
              <a
                href={OPENWORK_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="den-button-secondary w-full sm:w-auto"
                data-testid="join-org-download"
              >
                Download the desktop app
              </a>
            </div>

            <button
              type="button"
              className="w-fit text-sm text-[var(--dls-text-secondary)] underline-offset-4 hover:underline"
              onClick={() => void handleCopySignInLink()}
              disabled={copyBusy}
            >
              {copyBusy ? "Copying..." : copied ? "Copied sign-in link" : "Copy sign-in link"}
            </button>

            {handoffAttempted && !actionError ? (
              <p className="den-copy text-sm">Opening OpenWork now. If nothing happens, download the app or copy the sign-in link.</p>
            ) : null}
          </div>
        )}

        <button
          type="button"
          className="w-fit text-sm text-[var(--dls-text-secondary)] underline-offset-4 hover:underline"
          onClick={onContinueInBrowser}
          data-testid="join-org-continue-browser"
        >
          Continue in the browser
        </button>

        {actionError ? <div className="den-notice is-error">{actionError}</div> : null}
      </div>
    </section>
  );
}

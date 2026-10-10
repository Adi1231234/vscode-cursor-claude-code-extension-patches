/* MCPRECONNECTALL */ __COND____JSX__("div", {
  className: "cc-mcp-all",
  children: __JSX__("button", {
    className: __CSS__.actionButton,
    disabled: __BUSY__ !== null,
    onClick: async () => {
      __CLEAR__();
      __SETBUSY__({ server: "", action: "reconnectAll" });
      /* The servers the dialog itself offers a reconnect for: "Reconnect" when
         connected or failed, "Check connection" on a claude.ai one that needs
         auth. Any other server waiting for auth only offers "Authenticate". */
      const ccNames = __SERVERS__
        .filter((s) => s.status === "connected" || s.status === "failed" ||
          (s.status === "needs-auth" && s.config?.type === "claudeai-proxy"))
        .map((s) => s.name);
      try {
        const ccResults = await Promise.allSettled(ccNames.map((n) => __OPS__.reconnectMcpServer(n)));
        const ccFailed = ccNames.filter((n, k) => ccResults[k].status === "rejected");
        if (ccFailed.length) __SETERROR__("Reconnected " + (ccNames.length - ccFailed.length) + " of " +
          ccNames.length + ". Could not reconnect: " + ccFailed.join(", "));
        else __SETDONE__("Reconnected all " + ccNames.length + " servers");
      } finally {
        __SETBUSY__(null);
        await __REFRESH__();
      }
    },
    children: __BUSY__?.action === "reconnectAll" ? "Reconnecting all…" : "Reconnect all",
  }),
}),

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Network restores must verify the caller's admin role and owned network before calling any destructive RPC, so missing ownership cannot start a partial restore.
- Agents recreated during network restore bypass public signup checks only via the transaction-local `app.restore_agent` flag set inside `restore_create_agent`; signup metadata must never be trusted to skip those checks.

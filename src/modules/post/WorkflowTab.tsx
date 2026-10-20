/* Media management / post workflow plan (free text, monospace). */
import { FileText, Printer } from 'lucide-react';
import { update, useProject } from '@/store/project';
import { DEFAULT_WORKFLOW } from '@/store/defaults';
import { openPrint } from '@/store/app';
import { wordCount } from '@/lib/text';
import { Button, Textarea, Toolbar } from '@/ui';
import { Summary } from './components';

export function WorkflowTab() {
  const text = useProject((p) => p.post.workflow);
  const set = (v: string) => update((d) => void (d.post.workflow = v), { coalesce: 'post:workflow' });
  const empty = !text?.trim();
  return (
    <>
      <Toolbar>
        {empty && (
          <Button variant="primary" icon={FileText} onClick={() => update((d) => void (d.post.workflow = DEFAULT_WORKFLOW))}>
            Insert template
          </Button>
        )}
        <Button icon={Printer} onClick={() => openPrint('post-workflow')} disabled={empty}>
          Print plan
        </Button>
        <div className="spacer" />
        <Summary>
          <span className="muted">Camera cards, backups (3-2-1), naming, proxies, review & versioning, colour pipeline</span>
          {!empty && (
            <span>
              <b>{wordCount(text)}</b> words · saved automatically
            </span>
          )}
        </Summary>
      </Toolbar>
      <div className="module-body padded post-workflow-body">
        <Textarea
          className="post-workflow"
          value={text}
          onChange={set}
          spellCheck={false}
          placeholder={
            'Describe how media flows from camera to delivery:\n\n• Camera & codec, card naming\n• On-set offload & backups (3-2-1, checksums)\n• Folder structure\n• Proxies, editing software, project sharing\n• Review links, versioning, colour & mix pipeline\n\nOr click “Insert template” above to start from a checklist.'
          }
          aria-label="Media management plan"
        />
      </div>
    </>
  );
}

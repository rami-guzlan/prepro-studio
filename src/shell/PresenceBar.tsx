/* Hosted version: who else is in the open Production / Space, and a note
   while the live connection is down (edits still save; others see them later). */
import { useProjectStore } from '@/store/project';
import { useSpaceStore } from '@/store/space';
import { usePresence } from '@/backend/live';

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function PresenceBar() {
  const { people, connected } = usePresence();
  const hasSpace = useSpaceStore((s) => !!s.space);
  const hasProject = useProjectStore((s) => !!s.project);
  const open = hasSpace || hasProject;
  if (!open || (connected && people.length === 0)) return null;
  return (
    <div className="presence-bar" role="status">
      {!connected ? (
        <span className="muted small">Reconnecting… your edits still save</span>
      ) : (
        <>
          {people.map((p) => (
            <span key={p.uid} className="presence-dot" title={`${p.name} (${p.email}) is here`}>
              {initials(p.name || p.email)}
            </span>
          ))}
          <span className="small">{people.length === 1 ? `${people[0].name} is here too` : `${people.length} others are here`}</span>
        </>
      )}
    </div>
  );
}

import { StatusBadge } from '@/components/primitives/StatusBadge'
import type { SkillTagSummary } from '@/types/job'

interface SkillChipListProps {
  skills: SkillTagSummary[]
}

/** Plain neutral chips — color is reserved for status semantics
 * elsewhere, so required-vs-preferred is distinguished by the section
 * heading text, not by chip color. */
export function SkillChipList({ skills }: SkillChipListProps) {
  if (skills.length === 0) {
    return <p className="text-sm text-text-secondary">None specified.</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((skill) => (
        <StatusBadge key={skill.id} tone="neutral">
          {skill.name}
        </StatusBadge>
      ))}
    </div>
  )
}

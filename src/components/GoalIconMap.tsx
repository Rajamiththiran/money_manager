// File: src/components/GoalIconMap.tsx
// Shared Heroicon map for goal icons. Used by GoalCard and GoalsDashboardWidget.
import type { ComponentType } from "react";
import {
  FlagIcon,
  GlobeAltIcon,
  TruckIcon,
  HomeIcon,
  AcademicCapIcon,
  ShieldCheckIcon,
  GiftIcon,
  HeartIcon,
  StarIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";

const GOAL_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  target: FlagIcon,
  vacation: GlobeAltIcon,
  car: TruckIcon,
  home: HomeIcon,
  education: AcademicCapIcon,
  emergency: ShieldCheckIcon,
  gift: GiftIcon,
  heart: HeartIcon,
  star: StarIcon,
  piggy: CurrencyDollarIcon,
};

interface GoalIconProps {
  icon: string;
  className?: string;
  color?: string;
}

export default function GoalIcon({ icon, className = "h-5 w-5", color }: GoalIconProps) {
  const IconComponent = GOAL_ICON_MAP[icon] || FlagIcon;
  return (
    <span style={color ? { color } : undefined}>
      <IconComponent className={className} />
    </span>
  );
}

// File: src/types/tag.ts

export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface TagInfo {
  id: number;
  name: string;
  color: string;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  id: number;
  name?: string;
  color?: string;
}

export interface TagSpending {
  tag_id: number;
  tag_name: string;
  tag_color: string;
  total_income: number;
  total_expense: number;
  transaction_count: number;
  percentage?: number;
}

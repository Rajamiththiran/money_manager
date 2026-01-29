// File: src/types/category.ts
export interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  category_type: string;
}

export interface CategoryWithChildren {
  id: number;
  parent_id: number | null;
  name: string;
  category_type: string;
  children: Category[];
}

export interface CreateCategoryInput {
  parent_id: number | null;
  name: string;
  category_type: string;
}

export interface UpdateCategoryInput {
  id: number;
  name?: string;
  parent_id?: number;
}

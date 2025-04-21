import pool from '../config/database';

export const db = {
  query: (text: string, params: any[] = []) => pool.query(text, params)
};

export default pool; 
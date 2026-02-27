// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// これをエクスポートすることで、他のファイルから読み込んでDB操作ができるようになります
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
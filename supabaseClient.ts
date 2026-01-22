
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oelhjjfunolfqnqjmact.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbGhqamZ1bm9sZnFucWptYWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MzIyMDgsImV4cCI6MjA4NDQwODIwOH0.7dW2idtrzxDEZGvcR509jigHnjsply6fD1vb5-t4HT0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

-- Update existing subscription plans with actual Stripe price IDs
UPDATE subscription_plans
SET stripe_price_id = CASE id
  WHEN 'basic_monthly' THEN 'price_1RGnTDEAYAtQV9XuSdNMSh4w'
  WHEN 'pro_monthly' THEN 'price_1RGnn4EAYAtQV9Xuea1LiQRH'
  WHEN 'enterprise_monthly' THEN 'price_1RGnTEEAYAtQV9XuiJoPEkqd'
  WHEN 'basic_yearly' THEN 'price_1RGnaBEAYAtQV9XuwbDGBp8E'
  WHEN 'pro_yearly' THEN 'price_1RGnn6EAYAtQV9XuZj78EFUC'
  WHEN 'enterprise_yearly' THEN 'price_1RGnaCEAYAtQV9XuCp3amIQN'
  ELSE stripe_price_id
END
WHERE id IN ('basic_monthly', 'pro_monthly', 'enterprise_monthly', 
             'basic_yearly', 'pro_yearly', 'enterprise_yearly'); 
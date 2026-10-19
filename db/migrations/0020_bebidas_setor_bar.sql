-- Água, sucos, refrigerantes e bebidas embaladas são atendidos pelo bar.
-- Mantém produtos explicitamente atribuídos ao bar e não altera outras categorias.
UPDATE produtos SET setor='bar'
WHERE COALESCE(setor,'cozinha')='cozinha'
AND (
 nome ~* '(^|[^[:alpha:]])(água|agua|refrigerante|suco|cerveja|chopp|chope|energético|energetico|soda|água de coco|agua de coco)([^[:alpha:]]|$)'
);

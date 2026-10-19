-- Corrige produtos de bebidas cadastrados em categorias de bebidas, incluindo marcas.
-- O pedido continua unico; cada fila recebe exclusivamente os itens de seu setor.
UPDATE produtos p
SET setor='bar'
FROM categorias c
WHERE c.id=p.categoria_id
  AND COALESCE(p.setor,'cozinha') <> 'bar'
  AND (
    c.nome ~* '(bebidas?|cervejas?|chopp|chope|drinks?|coqueteis?|sucos?|refrigerantes?|águas?|aguas?|bar|vinhos?|destilados?|cafés?|cafes?)'
    OR p.nome ~* '(heineken|hein[e]?ken|budweiser|stella artois|corona|original|skol|brahma|antarctica|amstel|spaten|itaipava|bohemia|long neck|cerveja|chopp|chope|refrigerante|coca.cola|guaran[aá]|sprite|fanta|pepsi|energ[eé]tico|red bull|monster|suco|água|agua|drink|gin t[oô]nica|caipirinha|vodka|whisk[yey]|vinho)'
  );

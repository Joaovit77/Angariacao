-- Vendas V1-B3.2: interessado como contatos.id. Resolução só de leitura (INVOKER) e criar
-- com contatoId legado OU interessado {existente|novo}. Sem backfill nem contato criado aqui.
-- BEGIN VENDAS V1-B3.2
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Catálogo B2 preservado; acrescenta só os códigos do B3.1.
create or replace function private.vendas_b2_erro(p_codigo text, p_motivo text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_estado text; v_mensagem text;
begin
  v_estado := case p_codigo
    when 'nao-autenticado' then 'PT401' when 'nao-encontrado' then 'PT404'
    when 'versao-conflitante' then 'PT409' when 'chave-idempotencia-conflitante' then 'PT409'
    when 'telefone-ja-cadastrado' then 'PT409' when 'telefone-em-revisao' then 'PT409'
    when 'interessado-ambiguo' then 'PT409' when 'interessado-indisponivel' then 'PT409'
    when 'conflito-transitorio' then 'PT503'
    when 'falha-interna' then 'PT500' when 'dado-persistido-invalido' then 'PT500'
    else 'PT422' end;
  v_mensagem := case p_codigo
    when 'nao-autenticado' then 'Sessão necessária.'
    when 'nao-encontrado' then 'Oportunidade não encontrada.'
    when 'versao-conflitante' then 'A oportunidade mudou desde a leitura.'
    when 'chave-idempotencia-conflitante' then 'Esta chave pertence a outro pedido.'
    when 'estrutura-invalida' then 'Comando fora do contrato.'
    when 'versao-invalida' then 'Versão esperada inválida.'
    when 'transicao-invalida' then 'Transição não permitida.'
    when 'estado-terminal' then 'A oportunidade está encerrada.'
    when 'oportunidade-arquivada' then 'A oportunidade está arquivada.'
    when 'contato-invalido' then 'Contato não disponível para esta operação.'
    when 'imovel-invalido' then 'Imóvel não disponível para esta operação.'
    when 'modo-imovel-invalido' then 'Identificação do imóvel inválida.'
    when 'imovel-obrigatorio' then 'Informe o imóvel tratado.'
    when 'origem-invalida' then 'Origem comercial inválida.'
    when 'valor-invalido' then 'Valor fora do contrato numérico.'
    when 'valor-fechado-incompativel' then 'Valor fechado permitido somente no ganho.'
    when 'data-invalida' then 'Data ou instante inválido.'
    when 'data-futura' then 'A data do fato não pode ser futura em Brasília.'
    when 'ganho-invalido' then 'Requisitos do ganho não atendidos.'
    when 'perda-invalida' then 'Requisitos da perda não atendidos.'
    when 'arquivamento-invalido' then 'Somente oportunidade terminal pode ser arquivada.'
    when 'limite-versao' then 'Limite de versão atingido.'
    when 'conflito-transitorio' then 'Operação interrompida; repita o mesmo comando.'
    when 'dado-persistido-invalido' then 'Registro incompatível com o contrato.'
    when 'falha-interna' then 'A operação não foi concluída.'
    when 'nome-invalido' then 'Informe o nome do interessado.'
    when 'telefone-invalido' then 'Telefone inválido.'
    when 'contato-fundido' then 'Este contato foi unificado a outro.'
    when 'contato-anonimizado' then 'Este contato não pode mais ser usado.'
    when 'telefone-ja-cadastrado' then 'Este telefone já pertence a um contato seu.'
    when 'telefone-em-revisao' then 'Este telefone está em revisão em Contatos.'
    when 'interessado-ambiguo' then 'Mais de um contato corresponde; escolha um.'
    when 'interessado-indisponivel' then 'O contato deste telefone não pode ser usado.'
    else null end;
  if v_mensagem is null then
    v_estado := 'PT500'; p_codigo := 'falha-interna'; p_motivo := null;
    v_mensagem := 'A operação não foi concluída.';
  end if;
  raise exception using errcode = v_estado, message = v_mensagem,
    detail = pg_catalog.jsonb_build_object('contrato','vendas-b2-v1','codigo',p_codigo,'motivo',p_motivo)::text;
end;
$$;

-- Única implementação da resolução. INVOKER: no navegador vale a RLS de contatos; dentro do
-- executor (owner) vale o filtro explícito por auth.uid(). Não lê auth.users nem private.
create function public.vendas_resolver_interessado(p_consulta jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  usuario uuid := (select auth.uid()); digitado text; canonico text; candidatos jsonb;
  atual uuid; proximo uuid; arquivado timestamptz; anonimizado timestamptz;
  visitados uuid[] := '{}'; saltos integer := 0; avisos jsonb := '[]'::jsonb;
begin
  if usuario is null then
    raise exception using errcode = 'PT401', message = 'Sessão necessária.',
      detail = pg_catalog.jsonb_build_object('contrato','vendas-b2-v1','codigo','nao-autenticado','motivo',null)::text;
  end if;
  if pg_catalog.jsonb_typeof(p_consulta) is distinct from 'object'
    or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_consulta)) <> 1
    or pg_catalog.jsonb_typeof(p_consulta->'telefone') is distinct from 'string' then
    raise exception using errcode = 'PT422', message = 'Comando fora do contrato.',
      detail = pg_catalog.jsonb_build_object('contrato','vendas-b2-v1','codigo','estrutura-invalida','motivo',null)::text;
  end if;
  -- Mesmo conjunto de brancos de private.vendas_b2_trim e do String.trim do JavaScript.
  digitado := nullif(pg_catalog.btrim(p_consulta->>'telefone', pg_catalog.chr(9)||pg_catalog.chr(10)||pg_catalog.chr(11)||pg_catalog.chr(12)||pg_catalog.chr(13)||pg_catalog.chr(32)||pg_catalog.chr(160)||pg_catalog.chr(5760)||pg_catalog.chr(8192)||pg_catalog.chr(8193)||pg_catalog.chr(8194)||pg_catalog.chr(8195)||pg_catalog.chr(8196)||pg_catalog.chr(8197)||pg_catalog.chr(8198)||pg_catalog.chr(8199)||pg_catalog.chr(8200)||pg_catalog.chr(8201)||pg_catalog.chr(8202)||pg_catalog.chr(8232)||pg_catalog.chr(8233)||pg_catalog.chr(8239)||pg_catalog.chr(8287)||pg_catalog.chr(12288)||pg_catalog.chr(65279)), '');
  if digitado is not null and pg_catalog.char_length(digitado) <= 40 then canonico := public.telefone_canonico(digitado); end if;
  if canonico is null then return pg_catalog.jsonb_build_object('contrato','vendas-b3-resolucao-v1','status','telefone-invalido'); end if;

  select pg_catalog.jsonb_agg(x.id order by x.id collate "C") into candidatos
    from (select distinct r.contato_id::text id from public.contatos_revisoes r
           where r.user_id = usuario and r.estado = 'pendente' and r.tipo = 'telefone-alterado-legado'
             and r.evidencia->>'canonico_novo' = canonico) x;
  if candidatos is not null then
    return pg_catalog.jsonb_build_object('contrato','vendas-b3-resolucao-v1','status','em-revisao','candidatos',candidatos);
  end if;

  select pg_catalog.jsonb_agg(x.id order by x.id collate "C") into candidatos
    from (select distinct t.contato_id::text id from public.contatos_telefones t
           where t.user_id = usuario and t.telefone_canonico = canonico and t.desativado_em is null) x;
  if candidatos is null then return pg_catalog.jsonb_build_object('contrato','vendas-b3-resolucao-v1','status','nao-encontrado'); end if;
  if pg_catalog.jsonb_array_length(candidatos) > 1 then
    return pg_catalog.jsonb_build_object('contrato','vendas-b3-resolucao-v1','status','ambiguo','candidatos',candidatos);
  end if;

  -- Lápide com falha fechada: faltante, ciclo ou mais de 8 saltos não resolvem ninguém.
  atual := (candidatos->>0)::uuid;
  loop
    select c.fundido_em_contato_id, c.arquivado_em, c.anonimizado_em into proximo, arquivado, anonimizado
      from public.contatos c where c.id = atual and c.user_id = usuario;
    if not found or atual = any(visitados) then
      return pg_catalog.jsonb_build_object('contrato','vendas-b3-resolucao-v1','status','indisponivel','motivo','fusao-invalida');
    end if;
    visitados := visitados || atual;
    exit when proximo is null;
    if saltos >= 8 then
      return pg_catalog.jsonb_build_object('contrato','vendas-b3-resolucao-v1','status','indisponivel','motivo','fusao-invalida');
    end if;
    atual := proximo; saltos := saltos + 1;
  end loop;
  if anonimizado is not null then
    return pg_catalog.jsonb_build_object('contrato','vendas-b3-resolucao-v1','status','indisponivel','motivo','contato-anonimizado');
  end if;
  if arquivado is not null then avisos := avisos || '["contato-arquivado"]'::jsonb; end if;
  if exists (select 1 from public.contatos_revisoes r where r.user_id = usuario and r.estado = 'pendente'
               and (r.contato_id = atual or r.contato_relacionado_id = atual)) then
    avisos := avisos || '["revisao-pendente"]'::jsonb;
  end if;
  return pg_catalog.jsonb_build_object('contrato','vendas-b3-resolucao-v1','status','encontrado',
    'contatoId',atual::text,'seguiuFusao',saltos > 0,'avisos',avisos);
end;
$$;

-- B2 preservado; em criar aceita exatamente um entre contatoId (legado, mesmo fingerprint) e interessado.
create or replace function private.vendas_b2_normalizar(p_porta text, p_comando jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  obrigatorios text[]; permitidos text[]; c jsonb; imovel jsonb; origem jsonb; modo text; campo text;
  versao numeric; argumentos jsonb; ti jsonb := 'null'::jsonb; to_ jsonb := 'null'::jsonb;
  previsto jsonb; receita jsonb; fechado jsonb;
  interessado jsonb; identificacao jsonb; nome text; telefone text; canonico text;
begin
  obrigatorios := array['chaveIdempotencia'];
  if p_porta <> 'criar' then obrigatorios := obrigatorios || array['oportunidadeId','versaoEsperada']; end if;
  permitidos := obrigatorios;
  case p_porta
    when 'criar' then permitidos := permitidos || array['contatoId','interessado','imovelTratado','origem','valorNegocioPrevisto','receitaPrevista'];
    when 'transicionar' then obrigatorios := obrigatorios || array['destino']; permitidos := permitidos || array['destino'];
    when 'alterar_imovel' then obrigatorios := obrigatorios || array['imovelTratado']; permitidos := permitidos || array['imovelTratado'];
    when 'alterar_valores' then obrigatorios := obrigatorios || array['valorNegocioPrevisto','receitaPrevista']; permitidos := permitidos || array['valorNegocioPrevisto','receitaPrevista'];
    when 'ganhar' then obrigatorios := obrigatorios || array['confirmacaoExplicita','dataFato','registroFormalizacao']; permitidos := permitidos || array['confirmacaoExplicita','dataFato','registroFormalizacao','valorNegocioFechado'];
    when 'perder' then obrigatorios := obrigatorios || array['dataFato','motivo']; permitidos := permitidos || array['dataFato','motivo','justificativa'];
    when 'arquivar' then null;
    else perform private.vendas_b2_erro('estrutura-invalida');
  end case;
  if p_porta in ('criar','alterar_valores') and p_comando ? 'valorNegocioFechado' then perform private.vendas_b2_erro('valor-fechado-incompativel'); end if;
  perform private.vendas_b2_objeto(p_comando,permitidos,obrigatorios);
  if p_porta = 'criar' and (p_comando ? 'contatoId') = (p_comando ? 'interessado') then perform private.vendas_b2_erro('estrutura-invalida'); end if;
  c := pg_catalog.jsonb_build_object('chaveIdempotencia',private.vendas_b2_texto(p_comando->'chaveIdempotencia'));
  if p_porta <> 'criar' then
    if pg_catalog.jsonb_typeof(p_comando->'versaoEsperada') is distinct from 'number' then perform private.vendas_b2_erro('versao-invalida'); end if;
    versao := (p_comando->>'versaoEsperada')::numeric;
    if versao < 1 or versao > 9007199254740991 or versao <> pg_catalog.trunc(versao) then perform private.vendas_b2_erro('versao-invalida'); end if;
    c := c || pg_catalog.jsonb_build_object('oportunidadeId',private.vendas_b2_uuid(p_comando->'oportunidadeId'),'versaoEsperada',versao::bigint);
  end if;
  if p_porta = 'criar' and p_comando ? 'contatoId' then
    c := c || pg_catalog.jsonb_build_object('contatoId',private.vendas_b2_uuid(p_comando->'contatoId'));
    identificacao := c->'contatoId';
  elsif p_porta = 'criar' then
    -- Ordem fixa do B3.1: estrutura, depois nome, depois telefone.
    interessado := p_comando->'interessado';
    if pg_catalog.jsonb_typeof(interessado) is distinct from 'object' or pg_catalog.jsonb_typeof(interessado->'modo') is distinct from 'string' then
      perform private.vendas_b2_erro('estrutura-invalida');
    end if;
    if interessado->>'modo' = 'existente' then
      perform private.vendas_b2_objeto(interessado,array['modo','contatoId'],array['modo','contatoId']);
      interessado := pg_catalog.jsonb_build_object('modo','existente','contatoId',private.vendas_b2_uuid(interessado->'contatoId'));
      identificacao := pg_catalog.jsonb_build_array('existente',interessado->'contatoId');
    elsif interessado->>'modo' = 'novo' then
      perform private.vendas_b2_objeto(interessado,array['modo','nome','telefone'],array['modo','nome','telefone']);
      if pg_catalog.jsonb_typeof(interessado->'nome') is distinct from 'string'
        or pg_catalog.jsonb_typeof(interessado->'telefone') not in ('string','null') then
        perform private.vendas_b2_erro('estrutura-invalida');
      end if;
      nome := private.vendas_b2_trim(interessado->>'nome');
      if nome is null or pg_catalog.char_length(nome) > 200 then perform private.vendas_b2_erro('nome-invalido'); end if;
      if interessado->'telefone' = 'null'::jsonb then
        interessado := pg_catalog.jsonb_build_object('modo','novo','nome',nome,'telefone',null);
      else
        telefone := private.vendas_b2_trim(interessado->>'telefone');
        if telefone is not null and pg_catalog.char_length(telefone) <= 40 then canonico := public.telefone_canonico(telefone); end if;
        if canonico is null then perform private.vendas_b2_erro('telefone-invalido'); end if;
        interessado := pg_catalog.jsonb_build_object('modo','novo','nome',nome,'telefone',
          pg_catalog.jsonb_build_object('digitado',telefone,'canonico',canonico));
      end if;
      identificacao := pg_catalog.jsonb_build_array('novo',nome,canonico);
    else perform private.vendas_b2_erro('estrutura-invalida'); end if;
    c := c || pg_catalog.jsonb_build_object('interessado',interessado);
  end if;
  if p_porta in ('criar','alterar_imovel') then
    imovel := p_comando->'imovelTratado';
    if imovel is null or imovel = 'null'::jsonb then imovel := 'null'::jsonb;
    else
      if pg_catalog.jsonb_typeof(imovel) is distinct from 'object' then perform private.vendas_b2_erro('modo-imovel-invalido'); end if;
      modo := imovel->>'modo';
      if modo = 'referencia' then
        perform private.vendas_b2_objeto(imovel,array['modo','imovelId'],array['modo','imovelId'],'modo-imovel-invalido');
        imovel := pg_catalog.jsonb_build_object('modo','referencia','imovelId',private.vendas_b2_uuid(imovel->'imovelId'));
        ti := pg_catalog.jsonb_build_array('referencia',imovel->'imovelId');
      elsif modo = 'manual' then
        perform private.vendas_b2_objeto(imovel,array['modo','endereco','referencia','unidade','bloco','descricaoCurta'],array['modo'],'modo-imovel-invalido');
        imovel := pg_catalog.jsonb_build_object('modo','manual',
          'endereco',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'endereco',true)),
          'referencia',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'referencia',true)),
          'unidade',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'unidade',true)),
          'bloco',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'bloco',true)),
          'descricaoCurta',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'descricaoCurta',true)));
        ti := pg_catalog.jsonb_build_array('manual',imovel->'endereco',imovel->'referencia',imovel->'unidade',imovel->'bloco',imovel->'descricaoCurta');
      else perform private.vendas_b2_erro('modo-imovel-invalido'); end if;
    end if;
    c := c || pg_catalog.jsonb_build_object('imovelTratado',imovel);
  end if;
  if p_porta = 'criar' then
    origem := p_comando->'origem';
    if origem is null or origem = 'null'::jsonb then origem := 'null'::jsonb;
    else
      perform private.vendas_b2_objeto(origem,array['tipo','descricao'],array['tipo'],'origem-invalida');
      if pg_catalog.jsonb_typeof(origem->'tipo') is distinct from 'string' or not (origem->>'tipo' = any(array['indicacao','portal','whatsapp','telefone','formulario','atendimento_presencial','outro'])) then perform private.vendas_b2_erro('origem-invalida'); end if;
      origem := pg_catalog.jsonb_build_object('tipo',origem->>'tipo','descricao',private.vendas_b2_trim(private.vendas_b2_texto(origem->'descricao',true)));
      to_ := pg_catalog.jsonb_build_array(origem->'tipo',origem->'descricao');
    end if;
    c := c || pg_catalog.jsonb_build_object('origem',origem);
  end if;
  if p_porta in ('criar','alterar_valores') then
    c := c || pg_catalog.jsonb_build_object('valorNegocioPrevisto',private.vendas_b2_numeric(p_comando->'valorNegocioPrevisto'),'receitaPrevista',private.vendas_b2_numeric(p_comando->'receitaPrevista'));
  end if;
  if p_porta = 'transicionar' then c := c || pg_catalog.jsonb_build_object('destino',private.vendas_b2_texto(p_comando->'destino')); end if;
  if p_porta in ('ganhar','perder') then
    campo := private.vendas_b2_texto(p_comando->'dataFato'); perform private.vendas_b2_data(campo);
    c := c || pg_catalog.jsonb_build_object('dataFato',campo);
  end if;
  if p_porta = 'ganhar' then
    if pg_catalog.jsonb_typeof(p_comando->'confirmacaoExplicita') is distinct from 'boolean' then perform private.vendas_b2_erro('ganho-invalido','confirmacao-obrigatoria'); end if;
    c := c || pg_catalog.jsonb_build_object('confirmacaoExplicita',p_comando->'confirmacaoExplicita',
      'registroFormalizacao',private.vendas_b2_trim(private.vendas_b2_texto(p_comando->'registroFormalizacao')),
      'valorNegocioFechado',private.vendas_b2_numeric(p_comando->'valorNegocioFechado'));
  elsif p_porta = 'perder' then
    c := c || pg_catalog.jsonb_build_object('motivo',private.vendas_b2_texto(p_comando->'motivo'),
      'justificativa',private.vendas_b2_trim(private.vendas_b2_texto(p_comando->'justificativa',true)));
  end if;
  -- Valores tipados dentro das tuplas: decimal textual não vira string comercial.
  previsto := case when c->>'valorNegocioPrevisto' is null then 'null'::jsonb else pg_catalog.jsonb_build_array('numeric',c->'valorNegocioPrevisto') end;
  receita := case when c->>'receitaPrevista' is null then 'null'::jsonb else pg_catalog.jsonb_build_array('numeric',c->'receitaPrevista') end;
  fechado := case when c->>'valorNegocioFechado' is null then 'null'::jsonb else pg_catalog.jsonb_build_array('numeric',c->'valorNegocioFechado') end;
  argumentos := case p_porta
    when 'criar' then pg_catalog.jsonb_build_array(identificacao,ti,to_,previsto,receita)
    when 'transicionar' then pg_catalog.jsonb_build_array(c->'destino')
    when 'alterar_imovel' then pg_catalog.jsonb_build_array(ti)
    when 'alterar_valores' then pg_catalog.jsonb_build_array(previsto,receita)
    when 'ganhar' then pg_catalog.jsonb_build_array(c->'confirmacaoExplicita',c->'dataFato',c->'registroFormalizacao',fechado)
    when 'perder' then pg_catalog.jsonb_build_array(c->'dataFato',c->'motivo',c->'justificativa')
    else '[]'::jsonb end;
  return pg_catalog.jsonb_build_object('comando',c,'argumentos',argumentos);
end;
$$;

-- B2 preservado; só a identificação do contato em criar muda.
create or replace function private.vendas_b2_executar(p_porta text, p_comando jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  usuario uuid := (select auth.uid()); chave text; normalizado jsonb; c jsonb; hash text;
  recibo private.vendas_comandos%rowtype; anterior public.vendas_oportunidades%rowtype;
  atual public.vendas_oportunidades%rowtype; retrato_anterior jsonb; retrato jsonb;
  imovel jsonb; vivo record; capturar boolean := false; instante timestamptz; sem_mudanca boolean := false;
  evento_id uuid; tipo_evento text; dados jsonb; evento jsonb := 'null'::jsonb; resposta jsonb;
  linhas integer; fato date; operacao text; referencia uuid;
  contato uuid; lapide uuid; anonimizado timestamptz; interessado jsonb; resolucao jsonb; restricao text;
begin
  if usuario is null then perform private.vendas_b2_erro('nao-autenticado'); end if;
  perform 1 from auth.users u where u.id = usuario for key share;
  if not found then perform private.vendas_b2_erro('nao-autenticado'); end if;
  if pg_catalog.jsonb_typeof(p_comando) is distinct from 'object' then perform private.vendas_b2_erro('estrutura-invalida'); end if;
  chave := private.vendas_b2_texto(p_comando->'chaveIdempotencia');
  if not private.vendas_texto_util(chave) then perform private.vendas_b2_erro('estrutura-invalida'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.encode(
    private.vendas_b2_codificar(pg_catalog.jsonb_build_array('vendas-b2-lock-1',usuario::text,chave)),'hex'),0));
  select * into recibo from private.vendas_comandos r where r.user_id = usuario and r.chave_idempotencia = chave;
  begin
    normalizado := private.vendas_b2_normalizar(p_porta,p_comando);
    hash := private.vendas_b2_fingerprint(usuario,p_porta,normalizado);
  exception when sqlstate 'PT422' then
    if recibo.id is not null then perform private.vendas_b2_erro('chave-idempotencia-conflitante'); end if;
    raise;
  end;
  if recibo.id is not null then
    if recibo.fingerprint <> hash then perform private.vendas_b2_erro('chave-idempotencia-conflitante'); end if;
    return recibo.resposta;
  end if;
  c := normalizado->'comando';
  if p_porta = 'criar' then
    if c ? 'contatoId' or c->'interessado'->>'modo' = 'existente' then
      -- FOR SHARE: uma fusão concorrente não transforma o contato em lápide antes do commit.
      contato := coalesce(c->>'contatoId',c->'interessado'->>'contatoId')::uuid;
      select t.fundido_em_contato_id, t.anonimizado_em into lapide, anonimizado
        from public.contatos t where t.id = contato and t.user_id = usuario for share;
      if not found then perform private.vendas_b2_erro('contato-invalido'); end if;
      if lapide is not null then perform private.vendas_b2_erro('contato-fundido'); end if;
      if anonimizado is not null then perform private.vendas_b2_erro('contato-anonimizado'); end if;
    else
      interessado := c->'interessado';
      if interessado->'telefone' <> 'null'::jsonb then
        -- Depois da trava da chave. A resolução é refeita sob a trava e nunca reaproveita no modo novo.
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.encode(
          private.vendas_b2_codificar(pg_catalog.jsonb_build_array('vendas-b3-telefone-1',usuario::text,interessado->'telefone'->>'canonico')),'hex'),0));
        resolucao := public.vendas_resolver_interessado(pg_catalog.jsonb_build_object('telefone',interessado->'telefone'->>'digitado'));
        case resolucao->>'status'
          when 'nao-encontrado' then null;
          when 'encontrado' then perform private.vendas_b2_erro('telefone-ja-cadastrado');
          when 'em-revisao' then perform private.vendas_b2_erro('telefone-em-revisao');
          when 'ambiguo' then perform private.vendas_b2_erro('interessado-ambiguo');
          when 'indisponivel' then perform private.vendas_b2_erro('interessado-indisponivel');
          when 'telefone-invalido' then perform private.vendas_b2_erro('telefone-invalido');
          else perform private.vendas_b2_erro('falha-interna');
        end case;
      end if;
      begin
        insert into public.contatos(user_id,nome,origem) values(usuario,interessado->>'nome','vendas') returning id into contato;
        if interessado->'telefone' <> 'null'::jsonb then
          insert into public.contatos_telefones(contato_id,user_id,telefone,principal,motivo)
            values(contato,usuario,interessado->'telefone'->>'digitado',true,'cadastro');
        end if;
      exception when unique_violation then
        -- Só a corrida pelo mesmo número ativo (cadastro de imóvel não usa a trava de Vendas).
        get stacked diagnostics restricao = constraint_name;
        if restricao = 'contatos_telefones_ativo_unico_idx' then perform private.vendas_b2_erro('conflito-transitorio'); end if;
        raise;
      end;
    end if;
    atual.id := pg_catalog.gen_random_uuid(); atual.user_id := usuario; atual.contato_id := contato;
    atual.criado_por := usuario; atual.responsavel_usuario_id := usuario; atual.estado := 'nova'; atual.versao := 1;
    atual.origem_tipo := c->'origem'->>'tipo'; atual.origem_descricao := c->'origem'->>'descricao';
    atual.valor_negocio_previsto := (c->>'valorNegocioPrevisto')::numeric;
    atual.receita_prevista := (c->>'receitaPrevista')::numeric;
    tipo_evento := 'oportunidade_criada'; operacao := 'criar';
  else
    select * into anterior from public.vendas_oportunidades o
      where o.id = (c->>'oportunidadeId')::uuid and o.user_id = usuario for update;
    if not found then perform private.vendas_b2_erro('nao-encontrado'); end if;
    retrato_anterior := private.vendas_b2_snapshot(anterior);
    if anterior.versao = 9007199254740991 then perform private.vendas_b2_erro('limite-versao'); end if;
    if anterior.versao <> (c->>'versaoEsperada')::bigint then perform private.vendas_b2_erro('versao-conflitante'); end if;
    atual := anterior;
    if p_porta <> 'arquivar' then
      if anterior.arquivado_em is not null then perform private.vendas_b2_erro('oportunidade-arquivada'); end if;
      if anterior.estado in ('ganha','perdida') then
        if p_porta = 'transicionar' or p_porta in ('ganhar','perder') then perform private.vendas_b2_erro('transicao-invalida'); end if;
        perform private.vendas_b2_erro('estado-terminal');
      end if;
    end if;
    case p_porta
      when 'transicionar' then
        if not ((anterior.estado = 'nova' and c->>'destino' = 'em_atendimento')
          or (anterior.estado = 'em_atendimento' and c->>'destino' = 'em_negociacao')) then perform private.vendas_b2_erro('transicao-invalida'); end if;
        if c->>'destino' = 'em_negociacao' and atual.imovel_modo is null then perform private.vendas_b2_erro('imovel-obrigatorio'); end if;
        atual.estado := c->>'destino'; tipo_evento := 'etapa_alterada'; operacao := 'transicionar';
      when 'alterar_imovel' then
        tipo_evento := 'imovel_alterado'; operacao := 'alterar_imovel';
        if anterior.estado = 'em_negociacao' and c->'imovelTratado' = 'null'::jsonb then perform private.vendas_b2_erro('imovel-obrigatorio'); end if;
        sem_mudanca := retrato_anterior->'imovelTratado' = c->'imovelTratado';
      when 'alterar_valores' then
        atual.valor_negocio_previsto := (c->>'valorNegocioPrevisto')::numeric; atual.receita_prevista := (c->>'receitaPrevista')::numeric;
        sem_mudanca := atual.valor_negocio_previsto is not distinct from anterior.valor_negocio_previsto
          and atual.receita_prevista is not distinct from anterior.receita_prevista;
        tipo_evento := 'valor_alterado'; operacao := 'alterar_valores';
      when 'ganhar' then
        if anterior.estado <> 'em_negociacao' then perform private.vendas_b2_erro('transicao-invalida'); end if;
        if atual.imovel_modo is null then perform private.vendas_b2_erro('imovel-obrigatorio'); end if;
        if c->'confirmacaoExplicita' <> 'true'::jsonb then perform private.vendas_b2_erro('ganho-invalido','confirmacao-obrigatoria'); end if;
        if c->>'registroFormalizacao' is null then perform private.vendas_b2_erro('ganho-invalido','formalizacao-obrigatoria'); end if;
        atual.estado := 'ganha'; atual.encerramento_tipo := 'ganho'; atual.confirmacao_explicita := true;
        atual.registro_formalizacao := c->>'registroFormalizacao'; atual.valor_negocio_fechado := (c->>'valorNegocioFechado')::numeric;
        atual.motivo_perda := null; atual.justificativa_perda := null;
        tipo_evento := 'oportunidade_ganha'; operacao := 'transicionar';
      when 'perder' then
        if not (c->>'motivo' = any(array['desistencia_interessado','condicoes_incompativeis','imovel_indisponivel','compra_outro_canal','outro'])) then perform private.vendas_b2_erro('perda-invalida','motivo-perda-invalido'); end if;
        if c->>'motivo' = 'outro' and c->>'justificativa' is null then perform private.vendas_b2_erro('perda-invalida','justificativa-obrigatoria'); end if;
        atual.estado := 'perdida'; atual.encerramento_tipo := 'perda'; atual.motivo_perda := c->>'motivo'; atual.justificativa_perda := c->>'justificativa';
        atual.confirmacao_explicita := null; atual.registro_formalizacao := null; atual.valor_negocio_fechado := null;
        tipo_evento := 'oportunidade_perdida'; operacao := 'transicionar';
      when 'arquivar' then
        if anterior.estado not in ('ganha','perdida') then perform private.vendas_b2_erro('arquivamento-invalido'); end if;
        sem_mudanca := anterior.arquivado_em is not null; tipo_evento := 'oportunidade_arquivada'; operacao := 'arquivar';
      else perform private.vendas_b2_erro('estrutura-invalida');
    end case;
  end if;
  -- Captura somente em uma seleção efetiva; igualdade histórica não exige ponteiro vivo.
  if p_porta in ('criar','alterar_imovel') then
    imovel := c->'imovelTratado';
    if imovel->>'modo' = 'manual' and imovel->>'endereco' is null and imovel->>'referencia' is null then perform private.vendas_b2_erro('modo-imovel-invalido'); end if;
    if not sem_mudanca and imovel->>'modo' = 'referencia' then
      select i.id,i.codigo,i.referencia_crm,i.endereco,i.unidade,i.bloco into vivo
        from public.imoveis i where i.id = (imovel->>'imovelId')::uuid and i.user_id = usuario for share;
      if not found then perform private.vendas_b2_erro('imovel-invalido'); end if;
      capturar := true;
    end if;
  end if;
  instante := pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp(),'UTC');
  perform private.vendas_b2_instante(instante);
  if anterior.id is not null and instante < anterior.updated_at then perform private.vendas_b2_erro('data-invalida'); end if;
  if p_porta in ('ganhar','perder') then
    fato := private.vendas_b2_data(c->>'dataFato');
    if fato > (instante at time zone 'America/Sao_Paulo')::date then perform private.vendas_b2_erro('data-futura'); end if;
    atual.data_fato := fato; atual.encerrado_em := instante;
  end if;
  if capturar then
    referencia := pg_catalog.gen_random_uuid();
    insert into public.vendas_imoveis_referencias(id,user_id,imovel_id,imovel_id_original,codigo,referencia,endereco,unidade,bloco,capturado_em)
      values(referencia,usuario,vivo.id,vivo.id,vivo.codigo,vivo.referencia_crm,vivo.endereco,vivo.unidade,vivo.bloco,instante);
  end if;
  if p_porta in ('criar','alterar_imovel') and not sem_mudanca then
    atual.imovel_modo := imovel->>'modo'; atual.imovel_referencia_id := referencia;
    atual.manual_endereco := imovel->>'endereco'; atual.manual_referencia := imovel->>'referencia';
    atual.manual_unidade := imovel->>'unidade'; atual.manual_bloco := imovel->>'bloco'; atual.manual_descricao_curta := imovel->>'descricaoCurta';
  end if;
  if not sem_mudanca then
    atual.updated_at := instante;
    if p_porta = 'criar' then
      atual.created_at := instante;
      insert into public.vendas_oportunidades select (atual).* returning * into atual;
    else
      atual.versao := anterior.versao + 1;
      if p_porta = 'arquivar' then atual.arquivado_em := instante; end if;
      update public.vendas_oportunidades o set
        estado=atual.estado,versao=atual.versao,imovel_modo=atual.imovel_modo,imovel_referencia_id=atual.imovel_referencia_id,
        manual_endereco=atual.manual_endereco,manual_referencia=atual.manual_referencia,manual_unidade=atual.manual_unidade,
        manual_bloco=atual.manual_bloco,manual_descricao_curta=atual.manual_descricao_curta,
        valor_negocio_previsto=atual.valor_negocio_previsto,valor_negocio_fechado=atual.valor_negocio_fechado,receita_prevista=atual.receita_prevista,
        encerramento_tipo=atual.encerramento_tipo,data_fato=atual.data_fato,confirmacao_explicita=atual.confirmacao_explicita,
        registro_formalizacao=atual.registro_formalizacao,motivo_perda=atual.motivo_perda,justificativa_perda=atual.justificativa_perda,
        encerrado_em=atual.encerrado_em,arquivado_em=atual.arquivado_em,updated_at=atual.updated_at
        where o.id=anterior.id and o.user_id=usuario and o.versao=anterior.versao returning o.* into atual;
      get diagnostics linhas = row_count;
      if linhas <> 1 then perform private.vendas_b2_erro('versao-conflitante'); end if;
    end if;
    retrato := private.vendas_b2_snapshot(atual);
    dados := case tipo_evento
      when 'oportunidade_criada' then pg_catalog.jsonb_build_object('contatoId',retrato->'contatoId','imovelTratado',retrato->'imovelTratado','origem',retrato->'origem','valores',retrato->'valores')
      when 'etapa_alterada' then pg_catalog.jsonb_build_object('anterior',anterior.estado,'atual',atual.estado)
      when 'imovel_alterado' then pg_catalog.jsonb_build_object('anterior',retrato_anterior->'imovelTratado','atual',retrato->'imovelTratado')
      when 'valor_alterado' then pg_catalog.jsonb_build_object('anterior',retrato_anterior->'valores','atual',retrato->'valores')
      when 'oportunidade_ganha' then pg_catalog.jsonb_build_object('anterior',anterior.estado,'encerramento',retrato->'encerramento','valorNegocioFechado',retrato->'valores'->'valorNegocioFechado')
      when 'oportunidade_perdida' then pg_catalog.jsonb_build_object('anterior',anterior.estado,'encerramento',retrato->'encerramento')
      else pg_catalog.jsonb_build_object('estado',anterior.estado) end;
    evento_id := pg_catalog.gen_random_uuid();
    insert into public.vendas_oportunidades_eventos(id,user_id,oportunidade_id,tipo,ator_usuario_id,registrado_em,data_fato,versao,payload,chave_idempotencia)
      values(evento_id,usuario,atual.id,tipo_evento,usuario,instante,fato,atual.versao,
        pg_catalog.jsonb_build_object('versaoContrato',1,'dados',dados),chave);
    evento := pg_catalog.jsonb_build_object('id',evento_id::text,'userId',usuario::text,'oportunidadeId',atual.id::text,
      'tipo',tipo_evento,'atorUsuarioId',usuario::text,'registradoEm',private.vendas_b2_instante(instante),
      'dataFato',case when fato is null then null else pg_catalog.to_char(fato,'YYYY-MM-DD') end,
      'versao',atual.versao::text,'chaveIdempotencia',chave,'versaoContrato',1,'dados',dados);
  else retrato := retrato_anterior; end if;
  resposta := pg_catalog.jsonb_build_object('contrato','vendas-b2-v1','ok',true,'oportunidade',retrato,'evento',evento,'noOp',sem_mudanca);
  insert into private.vendas_comandos(id,user_id,chave_idempotencia,operacao,fingerprint,oportunidade_id,evento_id,resposta,created_at,concluido_em)
    values(pg_catalog.gen_random_uuid(),usuario,chave,operacao,hash,atual.id,evento_id,resposta,instante,instante);
  return resposta;
exception
  when deadlock_detected or serialization_failure or lock_not_available then perform private.vendas_b2_erro('conflito-transitorio'); return null;
  when others then
    if sqlstate in ('PT401','PT404','PT409','PT422','PT500','PT503') then raise; end if;
    perform private.vendas_b2_erro('falha-interna'); return null;
end;
$$;

alter function private.vendas_b2_erro(text,text) owner to postgres;
alter function private.vendas_b2_normalizar(text,jsonb) owner to postgres;
alter function private.vendas_b2_executar(text,jsonb) owner to postgres;
alter function public.vendas_resolver_interessado(jsonb) owner to postgres;
revoke all on function private.vendas_b2_erro(text,text), private.vendas_b2_normalizar(text,jsonb),
  private.vendas_b2_executar(text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.vendas_resolver_interessado(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.vendas_resolver_interessado(jsonb) to authenticated;

-- Por último: o lock exclusivo de contatos dura só até o commit logo abaixo. Só amplia a lista.
alter table public.contatos
  drop constraint contatos_origem_check,
  add constraint contatos_origem_check check (
    origem in (
      'cadastro', 'pre-cadastro', 'importacao', 'garimpo', 'indicado',
      'backfill-telefone', 'backfill-imovel', 'vendas'
    )
  );
commit;
-- END VENDAS V1-B3.2

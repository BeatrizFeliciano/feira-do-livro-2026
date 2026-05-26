// ── Translation strings ───────────────────────────────────
// Values can be strings or functions (called with args by t()).

export const tr = {
  pt: {
    // Navigation
    nav_catalog:        'Catálogo da Feira',
    nav_books:          'Os Meus Livros',
    nav_map:            'Mapa',
    nav_home_aria:      'Início',

    // About / Onboarding
    about_subtitle:        'Os meus livros na\nFeira do Livro de Lisboa 2026',
    about_feature_1:       'Explora o <strong>catálogo completo</strong> da feira e adiciona livros à tua lista',
    about_feature_2:       'Vê quais os <strong>livros do dia</strong> com desconto e em que dias estão disponíveis',
    about_feature_3:       'Liga o <strong>Goodreads</strong> para encontrares automaticamente os teus livros na feira',
    about_feature_4:       'Acompanha o que já <strong>compraste</strong> e quanto <strong>poupaste</strong>',
    about_feature_5:       'Localiza qualquer stand no <strong>mapa da feira</strong>',
    about_gr_instructions: 'Liga o Goodreads para cruzar a tua lista com os livros da feira. Copia o URL do teu perfil do Goodreads:',
    about_gr_btn:          'Ligar Goodreads →',
    about_skip_btn:        'Continuar sem Goodreads →',
    about_view_catalog:    'Ver o catálogo →',
    about_refresh:         'Atualizar livros',
    about_change_acct:     'Mudar conta',

    // Loading / Errors
    loading_books:         'A carregar os teus livros…',
    loading_gr:            'A carregar os teus livros do Goodreads…',
    loading_catalog:       'A carregar catálogo da feira...',
    loading_gr_shelf:      (i, n) => `A carregar livros do Goodreads… (${i}/${n})`,
    loading_match_isbn:    'A cruzar os teus livros com a feira — passo 1 de 3: ISBN e título em inglês…',
    loading_match_fuzzy:   (i, n) => `A cruzar os teus livros com a feira — passo 2 de 3: título e autor… (${i}/${n})`,
    loading_match_author:  'A cruzar os teus livros com a feira — passo 3 de 3: autor…',
    loading_gr_profile_id: 'A identificar o teu perfil de leitor…',
    error_gr_profile:      'Não foi possível carregar os livros do Goodreads. Verifica se o teu perfil e as tuas listas são públicos.',
    error_gr_empty:        'Nenhum livro da tua lista foi encontrado na feira. Verifica se as tuas listas no Goodreads são públicas.',
    error_gr_url_invalid:  'URL inválido. Copia o URL do teu perfil do Goodreads.',

    // Books page
    books_filter_all:       'Todos',
    books_filter_ldd:       'Livros do Dia',
    books_filter_not_bought:'Por comprar',
    books_filter_bought:    'Comprado',
    books_search_ph:        'Pesquisar por título, autor, editora ou stand...',
    books_view_list:        '☰ Lista',
    books_view_days:        '📅 Por dia',
    books_summary_to_buy:   'por comprar',
    books_summary_savings:  'poupança',
    books_summary_bought_n: (n) => `✓ ${n} comprado${n !== 1 ? 's' : ''}`,
    books_summary_saved:    'poupaste',
    books_all_days:         'Todos os dias',
    books_no_date:          'Sem data de desconto',
    books_empty_msg:        'Ainda não tens livros na tua lista.',
    books_empty_hint:       'Explora o catálogo e adiciona os livros que queres comprar.',
    books_empty_btn:        'Ir para o Catálogo →',
    books_empty_filtered:   'Nenhum livro encontrado.',
    books_pagination_prev:  '‹ Anterior',
    books_pagination_next:  'Próxima ›',
    books_n_books:          (n) => `${n} livro${n !== 1 ? 's' : ''}`,
    books_best_day_title:   'Melhor dia para ir',

    // Book actions
    action_want:         'Para comprar',
    action_remove:       'Remover',
    action_remove_list:  'Remover da lista',
    action_bought:       'Marcar como comprado',
    action_unbought:     'Marcar como não comprado',
    action_view_map:     (stand) => `Ver no mapa — Stand ${stand}`,

    // Catalog page
    catalog_search_ph:    'Pesquisar por título, autor ou editora…',
    catalog_all:          'Todos',
    catalog_ldd:          'Livros do Dia',
    catalog_gr_label:     'Goodreads',
    catalog_gr_prompt:    'Ligar Goodreads para ver os teus livros aqui →',
    catalog_want:         '♥ Quero',
    catalog_want_not:     '♡ Quero',
    catalog_empty:        'Nenhum livro encontrado.',
    catalog_no_results:   (q) => `Sem resultados para "${q}".`,
    catalog_error:        'Não foi possível carregar o catálogo.',
    catalog_loading_more: 'A carregar mais…',
    catalog_end:          '— fim dos resultados —',

    // GR shelf labels
    gr_to_read: 'Para ler',
    gr_reading:  'A ler',
    gr_read:     'Lidos',
    gr_dnf:      'Desistiu',

    // Map page
    map_search_ph:           'Pesquisar por stand, editora, ou livro...',
    map_all_days:            'Todos os dias',
    map_want:                'Para comprar',
    map_bought:              'Comprado',
    map_no_books_filtered:   (day) => `Sem livros da tua lista com desconto a ${day}.`,
    map_no_books:            'Nenhum livro da tua lista aqui.',

    // Days page
    days_all:        'Todos',
    days_not_bought: 'Por comprar',
    days_bought:     'Comprado',
    days_all_days:   'Todos os dias',
    days_search_ph:  'Pesquisar por título ou autor...',
    days_empty:      'Nenhum livro encontrado com este filtro.',

    // Confirm dialog
    confirm_cancel:      'Cancelar',
    confirm_remove:      'Remover',
    confirm_remove_book: (title) => `Remover "${title}" da tua lista?`,

    // Locale for date formatting
    date_locale: 'pt-PT',
  },

  en: {
    // Navigation
    nav_catalog:        'Fair Catalogue',
    nav_books:          'My Books',
    nav_map:            'Map',
    nav_home_aria:      'Home',

    // About / Onboarding
    about_subtitle:        'My books at the\nFeira do Livro de Lisboa 2026',
    about_feature_1:       'Browse the <strong>complete catalogue</strong> and add books to your list',
    about_feature_2:       'See which are the <strong>books of the day</strong> and when they are available',
    about_feature_3:       'Connect <strong>Goodreads</strong> to automatically find your books at the fair',
    about_feature_4:       'Track what you\'ve <strong>bought</strong> and how much you\'ve <strong>saved</strong>',
    about_feature_5:       'Locate any stand on the <strong>fair map</strong>',
    about_gr_instructions: 'Connect Goodreads to match your list with the fair\'s books. Paste your Goodreads profile URL:',
    about_gr_btn:          'Connect Goodreads →',
    about_skip_btn:        'Continue without Goodreads →',
    about_view_catalog:    'View catalogue →',
    about_refresh:         'Refresh books',
    about_change_acct:     'Change account',

    // Loading / Errors
    loading_books:         'Loading your books…',
    loading_gr:            'Loading your Goodreads books…',
    loading_catalog:       'Loading fair catalogue...',
    loading_gr_shelf:      (i, n) => `Loading Goodreads books… (${i}/${n})`,
    loading_match_isbn:    'Matching your books with the fair — step 1 of 3: ISBN & English title…',
    loading_match_fuzzy:   (i, n) => `Matching your books with the fair — step 2 of 3: title & author… (${i}/${n})`,
    loading_match_author:  'Matching your books with the fair — step 3 of 3: author…',
    loading_gr_profile_id: 'Identifying your reader profile…',
    error_gr_profile:      'Could not load Goodreads books. Make sure your profile and shelves are public.',
    error_gr_empty:        'No books from your list were found at the fair. Make sure your Goodreads shelves are public.',
    error_gr_url_invalid:  'Invalid URL. Please paste your Goodreads profile URL.',

    // Books page
    books_filter_all:       'All',
    books_filter_ldd:       'Books of the Day',
    books_filter_not_bought:'To buy',
    books_filter_bought:    'Bought',
    books_search_ph:        'Search by title, author, publisher or stand...',
    books_view_list:        '☰ List',
    books_view_days:        '📅 By day',
    books_summary_to_buy:   'to buy',
    books_summary_savings:  'savings',
    books_summary_bought_n: (n) => `✓ ${n} bought`,
    books_summary_saved:    'saved',
    books_all_days:         'All days',
    books_no_date:          'No discount date',
    books_empty_msg:        'You don\'t have any books in your list yet.',
    books_empty_hint:       'Browse the catalogue and add the books you want to buy.',
    books_empty_btn:        'Go to Catalogue →',
    books_empty_filtered:   'No books found.',
    books_pagination_prev:  '‹ Previous',
    books_pagination_next:  'Next ›',
    books_n_books:          (n) => `${n} book${n !== 1 ? 's' : ''}`,
    books_best_day_title:   'Best day to go',

    // Book actions
    action_want:         'Want to buy',
    action_remove:       'Remove',
    action_remove_list:  'Remove from list',
    action_bought:       'Mark as bought',
    action_unbought:     'Mark as not bought',
    action_view_map:     (stand) => `View on map — Stand ${stand}`,

    // Catalog page
    catalog_search_ph:    'Search by title, author or publisher…',
    catalog_all:          'All',
    catalog_ldd:          'Books of the Day',
    catalog_gr_label:     'Goodreads',
    catalog_gr_prompt:    'Connect Goodreads to see your books here →',
    catalog_want:         '♥ Want',
    catalog_want_not:     '♡ Want',
    catalog_empty:        'No books found.',
    catalog_no_results:   (q) => `No results for "${q}".`,
    catalog_error:        'Could not load the catalogue.',
    catalog_loading_more: 'Loading more…',
    catalog_end:          '— end of results —',

    // GR shelf labels
    gr_to_read:  'To read',
    gr_reading:  'Reading',
    gr_read:     'Read',
    gr_dnf:      'Did not finish',

    // Map page
    map_search_ph:           'Search by stand, publisher, or book...',
    map_all_days:            'All days',
    map_want:                'To buy',
    map_bought:              'Bought',
    map_no_books_filtered:   (day) => `No books from your list with a discount on ${day}.`,
    map_no_books:            'No books from your list here.',

    // Days page
    days_all:        'All',
    days_not_bought: 'To buy',
    days_bought:     'Bought',
    days_all_days:   'All days',
    days_search_ph:  'Search by title or author...',
    days_empty:      'No books found for this filter.',

    // Confirm dialog
    confirm_cancel:      'Cancel',
    confirm_remove:      'Remove',
    confirm_remove_book: (title) => `Remove "${title}" from your list?`,

    // Locale for date formatting
    date_locale: 'en-GB',
  },
}

// t(key) or t(key, ...args) when the value is a function
export function makeT(lang) {
  const dict = tr[lang] ?? tr.pt
  return (key, ...args) => {
    const val = dict[key] ?? tr.pt[key] ?? key
    return typeof val === 'function' ? val(...args) : val
  }
}

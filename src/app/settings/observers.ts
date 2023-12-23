import { languageSelector } from 'app/dim-api/selectors';
import { observe } from 'app/store/observeMiddleware';
import { RootState } from 'app/store/types';
import { observeStore } from 'app/utils/redux';
import i18next from 'i18next';
import { Store } from 'redux';

export function watchLanguageChanges() {
  return observeStore(languageSelector, (_prev, language) => {
    const languageChanged = language !== i18next.language;
    localStorage.setItem('dimLanguage', language);
    if (languageChanged) {
      i18next.changeLanguage(language);
    }
  });
}

export function watchLanguageChanges2(store: Store<RootState, any>) {
  store.dispatch(
    observe({
      id: 'lang-observer',
      getObserved: languageSelector,
      sideEffect: ({ current }) => {
        localStorage.setItem('dimLanguage', current);
        i18next.changeLanguage(current);
      },
    }),
  );
}

const en = {
  personal: 'Personal information', address: 'Address', taxSocial: 'Tax & social insurance', employment: 'Employment', compensation: 'Working hours & compensation', documents: 'Documents',
  firstName: 'First name', lastName: 'Last name', birthDate: 'Date of birth', birthPlace: 'Place of birth', birthCountry: 'Country of birth', nationality: 'Nationality',
  street: 'Street', houseNumber: 'House number', postalCode: 'Postal code', city: 'City', taxId: 'Tax identification number', taxClass: 'Tax class', socialSecurityNumber: 'Social security number', healthInsurance: 'Health insurance provider',
  startDate: 'Start date', term: 'Employment term', permanent: 'Permanent', fixedTerm: 'Fixed term', fixedUntil: 'Fixed until', minijobFlatTax: '2% flat-rate taxation (Minijob)', pensionExemption: 'Application for pension-insurance exemption',
  hoursPerWeek: 'Hours per week', annualVacation: 'Annual vacation entitlement', compensationType: 'Compensation type', noCompensation: 'Not specified', hourly: 'Hourly wage', fixed: 'Fixed salary', hourlyWage: 'Hourly wage', fixedSalary: 'Fixed salary',
  sensitiveNotice: 'Sensitive employee data is visible only inside this authorized workspace profile.', documentsNotice: 'Employee document upload is not configured. Sensitive identity files are not stored by this profile.',
  required: 'First name, last name and job title are required.', fixedEndRequired: 'A fixed-term employment requires an end date.', compensationRequired: 'Enter the selected compensation amount.', migrationRequired: 'The employee profile database migration must be applied first.', saveFailed: 'The employee profile could not be saved.', loadFailed: 'The employee profile could not be loaded.', deleteFailed: 'The employee could not be deleted.', notFound: 'Employee not found',
  createTitle: 'Add employee', createDescription: 'Create a structured employee profile for this workspace.', back: 'Back to employees', backToProfile: 'Back to employee profile', open: 'Open', yes: 'Yes', no: 'No',
}

const de: typeof en = {
  personal: 'Persönliche Angaben', address: 'Adresse', taxSocial: 'Steuern & Sozialversicherung', employment: 'Beschäftigung', compensation: 'Arbeitszeit & Vergütung', documents: 'Dokumente',
  firstName: 'Vorname', lastName: 'Nachname', birthDate: 'Geburtsdatum', birthPlace: 'Geburtsort', birthCountry: 'Geburtsland', nationality: 'Staatsangehörigkeit',
  street: 'Straße', houseNumber: 'Hausnummer', postalCode: 'Postleitzahl', city: 'Ort', taxId: 'Steuer-/Identifikationsnummer', taxClass: 'Steuerklasse', socialSecurityNumber: 'Sozialversicherungsnummer / SV-Nr.', healthInsurance: 'Name der Krankenkasse',
  startDate: 'Eintrittsdatum', term: 'Beschäftigungsdauer', permanent: 'Unbefristet', fixedTerm: 'Befristet', fixedUntil: 'Befristet bis', minijobFlatTax: '2 % Pauschalversteuerung (Minijob)', pensionExemption: 'Antrag auf Befreiung von der Rentenversicherungspflicht',
  hoursPerWeek: 'Stunden pro Woche', annualVacation: 'Jährlicher Urlaubsanspruch', compensationType: 'Vergütungsart', noCompensation: 'Nicht angegeben', hourly: 'Stundenlohn', fixed: 'Festgehalt', hourlyWage: 'Stundenlohn', fixedSalary: 'Festgehalt',
  sensitiveNotice: 'Sensible Mitarbeiterdaten sind nur innerhalb dieses autorisierten Arbeitsbereichsprofils sichtbar.', documentsNotice: 'Der Upload von Mitarbeiterdokumenten ist nicht eingerichtet. Sensible Ausweisdokumente werden in diesem Profil nicht gespeichert.',
  required: 'Vorname, Nachname und Tätigkeit sind erforderlich.', fixedEndRequired: 'Für eine Befristung ist ein Enddatum erforderlich.', compensationRequired: 'Gib den Betrag für die ausgewählte Vergütungsart ein.', migrationRequired: 'Zuerst muss die Datenbankmigration für Mitarbeiterprofile ausgeführt werden.', saveFailed: 'Das Mitarbeiterprofil konnte nicht gespeichert werden.', loadFailed: 'Das Mitarbeiterprofil konnte nicht geladen werden.', deleteFailed: 'Der Mitarbeiter konnte nicht gelöscht werden.', notFound: 'Mitarbeiter nicht gefunden',
  createTitle: 'Mitarbeiter hinzufügen', createDescription: 'Erstelle ein strukturiertes Mitarbeiterprofil für diesen Arbeitsbereich.', back: 'Zurück zu Mitarbeitern', backToProfile: 'Zurück zum Mitarbeiterprofil', open: 'Öffnen', yes: 'Ja', no: 'Nein',
}

const ru: typeof en = {
  personal: 'Личные данные', address: 'Адрес', taxSocial: 'Налоги и социальное страхование', employment: 'Трудоустройство', compensation: 'Рабочее время и оплата', documents: 'Документы',
  firstName: 'Имя', lastName: 'Фамилия', birthDate: 'Дата рождения', birthPlace: 'Место рождения', birthCountry: 'Страна рождения', nationality: 'Гражданство',
  street: 'Улица', houseNumber: 'Номер дома', postalCode: 'Почтовый индекс', city: 'Город', taxId: 'Налоговый идентификационный номер', taxClass: 'Налоговый класс', socialSecurityNumber: 'Номер социального страхования', healthInsurance: 'Медицинская страховая касса',
  startDate: 'Дата начала работы', term: 'Срок трудоустройства', permanent: 'Бессрочно', fixedTerm: 'Срочный договор', fixedUntil: 'Срок до', minijobFlatTax: 'Паушальное налогообложение 2% (Minijob)', pensionExemption: 'Заявление об освобождении от пенсионного страхования',
  hoursPerWeek: 'Часов в неделю', annualVacation: 'Ежегодный отпуск', compensationType: 'Тип оплаты', noCompensation: 'Не указано', hourly: 'Почасовая оплата', fixed: 'Фиксированная зарплата', hourlyWage: 'Почасовая ставка', fixedSalary: 'Фиксированная зарплата',
  sensitiveNotice: 'Конфиденциальные данные сотрудника доступны только в авторизованном профиле этого рабочего пространства.', documentsNotice: 'Загрузка документов сотрудников не настроена. Документы, удостоверяющие личность, в этом профиле не хранятся.',
  required: 'Имя, фамилия и должность обязательны.', fixedEndRequired: 'Для срочного договора требуется дата окончания.', compensationRequired: 'Укажите сумму для выбранного типа оплаты.', migrationRequired: 'Сначала необходимо применить миграцию БД для профилей сотрудников.', saveFailed: 'Не удалось сохранить профиль сотрудника.', loadFailed: 'Не удалось загрузить профиль сотрудника.', deleteFailed: 'Не удалось удалить сотрудника.', notFound: 'Сотрудник не найден',
  createTitle: 'Добавить сотрудника', createDescription: 'Создайте структурированный профиль сотрудника для этого рабочего пространства.', back: 'Назад к сотрудникам', backToProfile: 'Назад к профилю сотрудника', open: 'Открыть', yes: 'Да', no: 'Нет',
}

const tr: typeof en = {
  personal: 'Kişisel bilgiler', address: 'Adres', taxSocial: 'Vergi ve sosyal sigorta', employment: 'İstihdam', compensation: 'Çalışma süresi ve ücret', documents: 'Belgeler',
  firstName: 'Ad', lastName: 'Soyad', birthDate: 'Doğum tarihi', birthPlace: 'Doğum yeri', birthCountry: 'Doğum ülkesi', nationality: 'Uyruk',
  street: 'Sokak', houseNumber: 'Kapı numarası', postalCode: 'Posta kodu', city: 'Şehir', taxId: 'Vergi kimlik numarası', taxClass: 'Vergi sınıfı', socialSecurityNumber: 'Sosyal güvenlik numarası', healthInsurance: 'Sağlık sigortası kurumu',
  startDate: 'İşe giriş tarihi', term: 'İstihdam süresi', permanent: 'Süresiz', fixedTerm: 'Belirli süreli', fixedUntil: 'Bitiş tarihi', minijobFlatTax: '%2 sabit vergilendirme (Minijob)', pensionExemption: 'Emeklilik sigortası muafiyet başvurusu',
  hoursPerWeek: 'Haftalık çalışma saati', annualVacation: 'Yıllık izin hakkı', compensationType: 'Ücret türü', noCompensation: 'Belirtilmedi', hourly: 'Saatlik ücret', fixed: 'Sabit maaş', hourlyWage: 'Saatlik ücret', fixedSalary: 'Sabit maaş',
  sensitiveNotice: 'Hassas çalışan verileri yalnızca bu yetkili çalışma alanı profilinde görünür.', documentsNotice: 'Çalışan belgesi yükleme yapılandırılmamıştır. Hassas kimlik belgeleri bu profilde saklanmaz.',
  required: 'Ad, soyad ve görev zorunludur.', fixedEndRequired: 'Belirli süreli istihdam için bitiş tarihi gerekir.', compensationRequired: 'Seçilen ücret türü için tutarı girin.', migrationRequired: 'Önce çalışan profili veritabanı geçişi uygulanmalıdır.', saveFailed: 'Çalışan profili kaydedilemedi.', loadFailed: 'Çalışan profili yüklenemedi.', deleteFailed: 'Çalışan silinemedi.', notFound: 'Çalışan bulunamadı',
  createTitle: 'Çalışan ekle', createDescription: 'Bu çalışma alanı için yapılandırılmış çalışan profili oluşturun.', back: 'Çalışanlara dön', backToProfile: 'Çalışan profiline dön', open: 'Aç', yes: 'Evet', no: 'Hayır',
}

const uk: typeof en = {
  personal: 'Особисті дані', address: 'Адреса', taxSocial: 'Податки та соціальне страхування', employment: 'Працевлаштування', compensation: 'Робочий час і оплата', documents: 'Документи',
  firstName: 'Ім’я', lastName: 'Прізвище', birthDate: 'Дата народження', birthPlace: 'Місце народження', birthCountry: 'Країна народження', nationality: 'Громадянство',
  street: 'Вулиця', houseNumber: 'Номер будинку', postalCode: 'Поштовий індекс', city: 'Місто', taxId: 'Податковий ідентифікаційний номер', taxClass: 'Податковий клас', socialSecurityNumber: 'Номер соціального страхування', healthInsurance: 'Медична страхова каса',
  startDate: 'Дата початку роботи', term: 'Строк працевлаштування', permanent: 'Безстроково', fixedTerm: 'Строковий договір', fixedUntil: 'Строк до', minijobFlatTax: 'Паушальне оподаткування 2% (Minijob)', pensionExemption: 'Заява про звільнення від пенсійного страхування',
  hoursPerWeek: 'Годин на тиждень', annualVacation: 'Щорічна відпустка', compensationType: 'Тип оплати', noCompensation: 'Не вказано', hourly: 'Погодинна оплата', fixed: 'Фіксована зарплата', hourlyWage: 'Погодинна ставка', fixedSalary: 'Фіксована зарплата',
  sensitiveNotice: 'Конфіденційні дані працівника доступні лише в авторизованому профілі цього робочого простору.', documentsNotice: 'Завантаження документів працівників не налаштовано. Документи, що посвідчують особу, у цьому профілі не зберігаються.',
  required: 'Ім’я, прізвище та посада обов’язкові.', fixedEndRequired: 'Для строкового договору потрібна дата завершення.', compensationRequired: 'Вкажіть суму для вибраного типу оплати.', migrationRequired: 'Спочатку потрібно застосувати міграцію БД для профілів працівників.', saveFailed: 'Не вдалося зберегти профіль працівника.', loadFailed: 'Не вдалося завантажити профіль працівника.', deleteFailed: 'Не вдалося видалити працівника.', notFound: 'Працівника не знайдено',
  createTitle: 'Додати працівника', createDescription: 'Створіть структурований профіль працівника для цього робочого простору.', back: 'Назад до працівників', backToProfile: 'Назад до профілю працівника', open: 'Відкрити', yes: 'Так', no: 'Ні',
}

const pl: typeof en = {
  personal: 'Dane osobowe', address: 'Adres', taxSocial: 'Podatki i ubezpieczenia społeczne', employment: 'Zatrudnienie', compensation: 'Czas pracy i wynagrodzenie', documents: 'Dokumenty',
  firstName: 'Imię', lastName: 'Nazwisko', birthDate: 'Data urodzenia', birthPlace: 'Miejsce urodzenia', birthCountry: 'Kraj urodzenia', nationality: 'Obywatelstwo',
  street: 'Ulica', houseNumber: 'Numer domu', postalCode: 'Kod pocztowy', city: 'Miasto', taxId: 'Numer identyfikacji podatkowej', taxClass: 'Klasa podatkowa', socialSecurityNumber: 'Numer ubezpieczenia społecznego', healthInsurance: 'Kasa chorych',
  startDate: 'Data rozpoczęcia pracy', term: 'Okres zatrudnienia', permanent: 'Na czas nieokreślony', fixedTerm: 'Na czas określony', fixedUntil: 'Do dnia', minijobFlatTax: 'Ryczałtowe opodatkowanie 2% (Minijob)', pensionExemption: 'Wniosek o zwolnienie z ubezpieczenia emerytalnego',
  hoursPerWeek: 'Godziny tygodniowo', annualVacation: 'Roczny wymiar urlopu', compensationType: 'Rodzaj wynagrodzenia', noCompensation: 'Nie określono', hourly: 'Stawka godzinowa', fixed: 'Stałe wynagrodzenie', hourlyWage: 'Stawka godzinowa', fixedSalary: 'Stałe wynagrodzenie',
  sensitiveNotice: 'Wrażliwe dane pracownika są widoczne wyłącznie w autoryzowanym profilu tego obszaru roboczego.', documentsNotice: 'Przesyłanie dokumentów pracowników nie jest skonfigurowane. Wrażliwe dokumenty tożsamości nie są przechowywane w tym profilu.',
  required: 'Imię, nazwisko i stanowisko są wymagane.', fixedEndRequired: 'Zatrudnienie terminowe wymaga daty zakończenia.', compensationRequired: 'Wpisz kwotę dla wybranego rodzaju wynagrodzenia.', migrationRequired: 'Najpierw należy zastosować migrację bazy danych profili pracowników.', saveFailed: 'Nie udało się zapisać profilu pracownika.', loadFailed: 'Nie udało się wczytać profilu pracownika.', deleteFailed: 'Nie udało się usunąć pracownika.', notFound: 'Nie znaleziono pracownika',
  createTitle: 'Dodaj pracownika', createDescription: 'Utwórz uporządkowany profil pracownika dla tego obszaru roboczego.', back: 'Wróć do pracowników', backToProfile: 'Wróć do profilu pracownika', open: 'Otwórz', yes: 'Tak', no: 'Nie',
}

const fr: typeof en = {
  personal: 'Informations personnelles', address: 'Adresse', taxSocial: 'Fiscalité et assurance sociale', employment: 'Emploi', compensation: 'Temps de travail et rémunération', documents: 'Documents',
  firstName: 'Prénom', lastName: 'Nom', birthDate: 'Date de naissance', birthPlace: 'Lieu de naissance', birthCountry: 'Pays de naissance', nationality: 'Nationalité',
  street: 'Rue', houseNumber: 'Numéro', postalCode: 'Code postal', city: 'Ville', taxId: 'Numéro d’identification fiscale', taxClass: 'Classe fiscale', socialSecurityNumber: 'Numéro de sécurité sociale', healthInsurance: 'Organisme d’assurance maladie',
  startDate: 'Date d’entrée', term: 'Durée de l’emploi', permanent: 'Durée indéterminée', fixedTerm: 'Durée déterminée', fixedUntil: 'Jusqu’au', minijobFlatTax: 'Imposition forfaitaire de 2 % (Minijob)', pensionExemption: 'Demande d’exemption de l’assurance retraite',
  hoursPerWeek: 'Heures par semaine', annualVacation: 'Droit annuel aux congés', compensationType: 'Type de rémunération', noCompensation: 'Non indiqué', hourly: 'Salaire horaire', fixed: 'Salaire fixe', hourlyWage: 'Salaire horaire', fixedSalary: 'Salaire fixe',
  sensitiveNotice: 'Les données sensibles du salarié sont visibles uniquement dans ce profil d’espace de travail autorisé.', documentsNotice: 'Le téléversement de documents salariés n’est pas configuré. Les pièces d’identité sensibles ne sont pas stockées dans ce profil.',
  required: 'Le prénom, le nom et le poste sont obligatoires.', fixedEndRequired: 'Un emploi à durée déterminée requiert une date de fin.', compensationRequired: 'Saisissez le montant correspondant au type de rémunération choisi.', migrationRequired: 'La migration de base de données des profils salariés doit d’abord être appliquée.', saveFailed: 'Le profil salarié n’a pas pu être enregistré.', loadFailed: 'Le profil salarié n’a pas pu être chargé.', deleteFailed: 'Le salarié n’a pas pu être supprimé.', notFound: 'Salarié introuvable',
  createTitle: 'Ajouter un salarié', createDescription: 'Créez un profil salarié structuré pour cet espace de travail.', back: 'Retour aux salariés', backToProfile: 'Retour au profil salarié', open: 'Ouvrir', yes: 'Oui', no: 'Non',
}

function prefix(dictionary: typeof en) {
  return Object.fromEntries(Object.entries(dictionary).map(([key, value]) => [`employees.profile.${key}`, value]))
}

export const employeeProfileDictionaries = {
  en: prefix(en), de: prefix(de), ru: prefix(ru), tr: prefix(tr), uk: prefix(uk), pl: prefix(pl), fr: prefix(fr),
} as const

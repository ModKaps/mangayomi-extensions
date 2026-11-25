import 'dart:convert';
import 'dart:developer';
import 'dart:io';
import 'dart/anime/anime_source_list.dart';
import 'dart/manga/manga_source_list.dart';
import 'dart/novel/novel_source_list.dart';
import 'model/source.dart';

void main() {
  final jsSources = _searchJsSources(Directory("javascript"));
  genManga(
    jsSources.where((element) => element.itemType!.name == "manga").toList(),
  );
  genAnime(
    jsSources.where((element) => element.itemType!.name == "anime").toList(),
  );
  genNovel(
    jsSources.where((element) => element.itemType!.name == "novel").toList(),
  );
}

void genManga(List<Source> jsMangasourceList) {
  final mangaSources = [...dartMangasourceList, ...jsMangasourceList];
  final jsonList = mangaSources.map((source) => source.toJson()).toList();
  final jsonString = jsonEncode(jsonList);

  final file = File('index.json');
  file.writeAsStringSync(jsonString);

  log('JSON file created: ${file.path}');
}

void genAnime(List<Source> jsAnimesourceList) {
  final animeSources = [...dartAnimesourceList, ...jsAnimesourceList];
  final jsonList = animeSources.map((source) => source.toJson()).toList();
  final jsonString = jsonEncode(jsonList);

  final file = File('anime_index.json');
  file.writeAsStringSync(jsonString);

  log('JSON file created: ${file.path}');
}

void genNovel(List<Source> jsNovelSourceList) {
  final novelSources = [...dartNovelSourceList, ...jsNovelSourceList];
  final jsonList = novelSources.map((source) => source.toJson()).toList();
  final jsonString = jsonEncode(jsonList);

  final file = File('novel_index.json');
  file.writeAsStringSync(jsonString);

  log('JSON file created: ${file.path}');
}

List<Source> _searchJsSources(Directory dir) {
  final sourceList = [].cast<Source>().toList();
  final entities = dir.listSync();
  for (final entity in entities) {
    if (entity is Directory) {
      final subEntities = entity.listSync();
      for (final subEntity in subEntities) {
        if (subEntity is Directory) {
          sourceList.addAll(_searchJsSources(subEntity));
        } else if (subEntity is File && subEntity.path.endsWith('.js')) {
          final regex = RegExp(
            r'const\s+mangayomiSources\s*=\s*(\[.*?\]);',
            dotAll: true,
          );
          final defaultSource = Source();
          final match = regex.firstMatch(subEntity.readAsStringSync());
          if (match != null) {
            for (final sourceJson in jsonDecode(match.group(1)!) as List) {
              final langs = sourceJson["langs"] as List?;
              var source = Source.fromJson(sourceJson)
                ..sourceCodeLanguage = 1
                ..appMinVerReq =
                    sourceJson["appMinVerReq"] ?? defaultSource.appMinVerReq
                ..sourceCodeUrl =
                    "https://raw.githubusercontent.com/ModKaps/mangayomi-extensions/main/javascript/${sourceJson["pkgPath"] ?? sourceJson["pkgName"]}";
              if (sourceJson["id"] != null) {
                source = source..id = int.tryParse("${sourceJson["id"]}");
              }
              if (langs?.isNotEmpty ?? false) {
                for (final lang in langs!) {
                  final id = sourceJson["ids"]?[lang] as int?;
                  sourceList.add(
                    Source.fromJson(source.toJson())
                      ..lang = lang
                      ..id =
                          id ??
                          'mangayomi-js-"$lang"."${source.name}"'.hashCode,
                  );
                }
              } else {
                sourceList.add(source);
              }
            }
          }
        }
      }
    }
  }
  return sourceList;
}

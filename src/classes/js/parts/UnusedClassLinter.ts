import { JSLinter } from "./abstraction/JSLinter";
import { TextDocument, XMLParser } from "ui5plugin-parser";
import { RangeAdapter } from "../../adapters/RangeAdapter";
import { JSLinters, IError } from "../../Linter";
import { IXMLFile } from "ui5plugin-parser/dist/classes/utils/FileReader";
import { AbstractCustomClass } from "ui5plugin-parser/dist/classes/UI5Classes/UI5Parser/UIClass/AbstractCustomClass";
import { AbstractUI5Parser } from "ui5plugin-parser/dist/IUI5Parser";

export class UnusedClassLinter<
	Parser extends AbstractUI5Parser<CustomClass>,
	CustomClass extends AbstractCustomClass
> extends JSLinter<Parser, CustomClass> {
	protected className = JSLinters.UnusedClassLinter;
	protected _getErrors(document: TextDocument): IError[] {
		const errors: IError[] = [];

		const className = this._parser.fileReader.getClassNameFromPath(document.fileName);
		if (className) {
			const UIClass = this._parser.classFactory.getUIClass(className);
			if (UIClass instanceof AbstractCustomClass) {
				const classIsUsed = this._checkIfClassIsUsed(UIClass);
				if (!classIsUsed) {
					const range = RangeAdapter.acornPositionsToRange({ column: 0, line: 1 }, { column: 0, line: 1 });
					errors.push({
						source: this.className,
						code: "UI5Plugin",
						className: UIClass.className,
						message: `No references found for "${className}" class`,
						range: range,
						severity: this._configHandler.getSeverity(this.className),
						fsPath: document.fileName
					});
				}
			}
		}

		return errors;
	}

	private _checkIfClassIsUsed(UIClass: AbstractCustomClass) {
		const isException = this._checkClassForLintingExceptions(UIClass);
		const allCustomUIClasses = this._parser.classFactory.getAllCustomUIClasses();

		return (
			isException ||
			allCustomUIClasses.some(customUIClass => {
				return (
					this._checkIfClassIsImportedInUIDefine(customUIClass, UIClass) ||
					this._checkIfClassIsUsedAsInterface(customUIClass, UIClass)
				);
			}) ||
			this._checkIfClassMentionedInManifest(UIClass) ||
			this._checkIfClassIsViewsController(UIClass) ||
			this._checkIfClassIsUsedInView(UIClass)
		);
	}

	private _checkClassForLintingExceptions(UIClass: AbstractCustomClass) {
		return UIClass.fsPath?.toLowerCase().endsWith("component.js") || UIClass.fsPath?.toLowerCase().endsWith("component.ts") || false;
	}

	private _checkIfClassIsUsedInView(UIClass: AbstractCustomClass) {
		const isControlOrElement =
			this._parser.classFactory.isClassAChildOfClassB(UIClass.className, "sap.ui.core.Control") ||
			this._parser.classFactory.isClassAChildOfClassB(UIClass.className, "sap.ui.core.Element");

		if (!isControlOrElement) {
			return false;
		}

		const views: IXMLFile[] = this._parser.fileReader.getAllViews();
		const fragments: IXMLFile[] = this._parser.fileReader.getAllFragments();
		const XMLFiles: IXMLFile[] = views.concat(fragments);
		const classNameLastPart = UIClass.className.split(".").pop();
		return (
			classNameLastPart &&
			XMLFiles.some(XMLFile => {
				if (XMLFile.content.indexOf(classNameLastPart) === -1) {
					return false;
				}

				const tags = XMLParser.getAllTags(XMLFile);
				return tags.some(tag => {
					const className = XMLParser.getFullClassNameFromTag(tag, XMLFile);
					return className === UIClass.className;
				});
			})
		);
	}

	private _checkIfClassIsUsedAsInterface(customUIClass: AbstractCustomClass, UIClass: AbstractCustomClass): unknown {
		return customUIClass.interfaces.some(interfaceName => {
			return interfaceName === UIClass.className;
		});
	}

	private _checkIfClassIsImportedInUIDefine(customUIClass: AbstractCustomClass, UIClass: AbstractCustomClass): unknown {
		return customUIClass.UIDefine.some(UIDefine => {
			return UIDefine.classNameDotNotation === UIClass.className;
		});
	}

	private _checkIfClassIsViewsController(UIClass: AbstractCustomClass) {
		if (UIClass.fsPath?.endsWith(".controller.js") || UIClass.fsPath?.endsWith(".controller.ts")) {
			return this._parser.fileReader.getAllViews().some(view => {
				return view.controllerName === UIClass.className;
			});
		} else {
			return false;
		}
	}

	private _checkIfClassMentionedInManifest(UIClass: AbstractCustomClass): unknown {
		const manifest = this._parser.fileReader.getManifestForClass(UIClass.className);
		let isMentionedInManifest = false;

		try {
			isMentionedInManifest = JSON.stringify(manifest?.content).indexOf(UIClass.className) > -1;
		} catch (error) {
			isMentionedInManifest = false;
		}

		return isMentionedInManifest;
	}
}

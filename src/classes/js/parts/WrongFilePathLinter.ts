import * as fs from "fs";
import { AbstractUI5Parser, ParserPool, TextDocument } from "ui5plugin-parser";
import { AbstractCustomClass } from "ui5plugin-parser/dist/classes/parsing/ui5class/AbstractCustomClass";
import { CustomJSClass } from "ui5plugin-parser/dist/classes/parsing/ui5class/js/CustomJSClass";
import { EmptyJSClass } from "ui5plugin-parser/dist/classes/parsing/ui5class/js/EmptyJSClass";
import { CustomTSClass } from "ui5plugin-parser/dist/classes/parsing/ui5class/ts/CustomTSClass";
import { CustomTSObject } from "ui5plugin-parser/dist/classes/parsing/ui5class/ts/CustomTSObject";
import { RangeAdapter } from "ui5plugin-parser/dist/classes/parsing/util/range/adapters/RangeAdapter";
import { IError, JSLinters } from "../../Linter";
import { JSLinter } from "./abstraction/JSLinter";

export class WrongFilePathLinter<
	Parser extends AbstractUI5Parser<CustomClass>,
	CustomClass extends AbstractCustomClass
> extends JSLinter<Parser, CustomClass> {
	protected className = JSLinters.WrongFilePathLinter;
	protected _getErrors(document: TextDocument): IError[] {
		const errors: IError[] = [];

		const className = this._parser.fileReader.getClassNameFromPath(document.fileName);
		if (className) {
			const UIClass = this._parser.classFactory.getUIClass(className);
			if (UIClass instanceof AbstractCustomClass && UIClass.classText) {
				const manifest = ParserPool.getManifestForClass(UIClass.className);
				if (manifest) {
					const rClassNamesRegex = new RegExp(
						`${manifest.componentName.replace(/\./, "\\.")}\\..*?(?="|'|}|\\[|\\]|>|\\|)`,
						"g"
					);
					if (rClassNamesRegex) {
						let result = rClassNamesRegex.exec(UIClass.classText);
						while (result) {
							const sClassName = result[0];
							const isClassNameValid = this._validateClassName(sClassName);
							if (!isClassNameValid) {
								const positionBegin = result.index;
								const positionEnd = positionBegin + sClassName.length;
								const range = RangeAdapter.offsetsRange(UIClass.classText, positionBegin, positionEnd);
								if (range) {
									errors.push({
										code: "UI5Plugin",
										className: UIClass.className,
										source: this.className,
										message: `Class "${sClassName}" doesn't exist`,
										range: range,
										severity: this._configHandler.getSeverity(this.className),
										fsPath: document.fileName
									});
								}
							}

							result = rClassNamesRegex.exec(UIClass.classText);
						}
					}
				}
			}
		}
		return errors;
	}

	private _validateClassName(className: string) {
		let isPathValid = false;
		const UIClass = this._parser.classFactory.getUIClass(className);
		if (UIClass && UIClass instanceof CustomJSClass) {
			isPathValid = UIClass.classExists;
		} else if (UIClass && UIClass instanceof EmptyJSClass) {
			isPathValid = false;
		} else if (UIClass && (UIClass instanceof CustomTSClass || UIClass instanceof CustomTSObject)) {
			isPathValid = true;
		}

		if (!isPathValid) {
			const sFileFSPath = this._parser.fileReader.convertClassNameToFSPath(className, false, false, true);
			const aAllViews = ParserPool.getAllViews();
			const oView = aAllViews.find(oView => oView.fsPath === sFileFSPath);
			isPathValid = !!oView;
		}

		if (!isPathValid) {
			const sFileFSPath = this._parser.fileReader.convertClassNameToFSPath(className, false, true, false);
			const aAllFragments = ParserPool.getAllFragments();
			const oFragment = aAllFragments.find(oFragment => oFragment.fsPath === sFileFSPath);
			isPathValid = !!oFragment;
		}

		if (!isPathValid) {
			if (className.endsWith(".")) {
				className = className.substring(0, className.length - 1);
			}
			const sFileFSPath = this._parser.fileReader
				.convertClassNameToFSPath(className)
				?.replace(".js", ".properties")
				.replace(".ts", ".properties");
			if (sFileFSPath) {
				isPathValid = fs.existsSync(sFileFSPath);
			}
		}

		if (!isPathValid) {
			if (className.endsWith(".")) {
				className = className.substring(0, className.length - 1);
			}
			const sFileFSPath = this._parser.fileReader
				.convertClassNameToFSPath(className)
				?.replace(".js", "")
				.replace(".ts", "");
			if (sFileFSPath) {
				isPathValid = fs.existsSync(sFileFSPath);
			}
		}

		if (!isPathValid) {
			const sFileFSPath = this._parser.fileReader.convertClassNameToFSPath(className);
			if (sFileFSPath) {
				isPathValid = fs.existsSync(sFileFSPath);
			}
		}

		return isPathValid;
	}
}
